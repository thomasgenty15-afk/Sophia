import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import type {
  MorningNudgePayloadV2,
  PostMorningNudgeFlowKind,
  PostMorningNudgeStatus,
} from "./morning_nudge_contract.ts";
import { isPostMorningNudgeFlowKind } from "./morning_nudge_contract.ts";
import {
  createNoteInformation,
  normalizeNoteInformation,
  type NoteInformation,
  noteInformationForTrace,
} from "./contracts/note_information.v1.ts";

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
  activation_note_information: NoteInformation;
  local_assessment: PostMorningNudgeLocalAssessment;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
};

export type PostMorningNudgeContextPack = {
  source: "morning_nudge_v2_payload";
  freshness: "current_active_flow";
  confidence: "high";
  status: "user_provided" | "db_derived" | "inferred" | "bridge_provided";
  flow_kind: PostMorningNudgeFlowKind;
  source_nudge_summary: string;
  target_action_titles: string[];
  target_item_titles: string[];
  suppressed_action_titles: string[];
  suppression_reason: string | null;
  morning_anchor: MorningNudgePayloadV2["morning_anchor"] | null;
  posture: string | null;
  coach_intent: string | null;
  evidence: string[];
};

export type PostMorningNudgeMicroMemoryContext = {
  items: Array<{
    summary: string;
    source:
      | "action_memory"
      | "semantic_memory"
      | "thread_memory"
      | "plan_item_memory"
      | "event_memory";
    linked_object: {
      type: "plan_item" | "action" | "memory_item" | "thread" | "unknown";
      id: string | null;
      label: string | null;
    };
    freshness: "same_turn" | "recent" | "older";
    confidence: "low" | "medium" | "high";
    evidence: string[];
    sensitivity: "normal" | "sensitive" | "safety";
  }>;
  exclusions: string[];
  budget: {
    max_items: number;
    reason: string;
  };
};

export type PostMorningNudgeConversationContext = {
  state_summary: string;
  source_nudge_summary: string;
  flow_kind: PostMorningNudgeFlowKind;
  user_words: string[];
  field_or_stage: string | null;
  known_values: Record<string, unknown>;
  missing_or_weak_values: string[];
  selected_candidate: Record<string, unknown>;
  handoff_data: Record<string, unknown>;
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

export type PostMorningNudgeFlowActionCategory =
  | "continue_local"
  | "ask_clarification"
  | "repeat_context"
  | "stop_local_no_handoff"
  | "complete_flow"
  | "exit_to_global_dispatcher"
  | "handoff_to_local_dispatcher"
  | "safety_preempt";

export type PostMorningNudgeDispatcherId =
  | "post_morning_nudge.action_dispatcher"
  | "post_morning_nudge.suppressed_action_dispatcher"
  | "post_morning_nudge.emotional_presence_dispatcher";

export type PostMorningNudgeExitReason =
  | "topic_change"
  | "explicit_tool_request"
  | "new_goal"
  | "product_help"
  | "status_question"
  | "preference_update"
  | "safety"
  | "unknown";

export type PostMorningNudgeLikelyIntent =
  | "prepare_attack_card"
  | "prepare_defense_card"
  | "select_state_potion"
  | "update_coach_preferences"
  | "product_help"
  | "normal_coaching"
  | "unknown";

export type PostMorningNudgeLocalHandoffNote = {
  reason: PostMorningNudgeExitReason;
  user_message_summary: string;
  flow_summary: string;
  source_flow: string;
  target_dispatcher: NoteInformation["target_dispatcher"];
  collected_state: {
    skill_id: "post_morning_nudge";
    flow_kind: PostMorningNudgeFlowKind;
    source_nudge_summary: string;
    target_action_titles: string[];
    suppressed_action_titles: string[];
    suppression_reason: string | null;
    last_local_assessment: string;
  };
  recommended_next_focus: PostMorningNudgeLikelyIntent | string;
  constraints: string[];
  note_information: NoteInformation;
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
    conversation_context: PostMorningNudgeConversationContext;
  };
  note_information: NoteInformation | null;
  evidence: string[];
};

export type PostMorningNudgeActionDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  current_user_message: string;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: PostMorningNudgeActiveState;
  note_information_inbound?: NoteInformation | null;
  db_context_pack: PostMorningNudgeContextPack;
  micro_memory_context: PostMorningNudgeMicroMemoryContext;
  platform_context: Record<string, unknown>;
  risk_context: Record<string, unknown>;
  available_inline_tools: string[];
  parent_flow_context: Record<string, unknown>;
  timezone: string;
  channel: string;
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
    conversation_context: PostMorningNudgeConversationContext;
  };
  note_information: NoteInformation | null;
  evidence: string[];
};

export type PostMorningNudgeSuppressedActionDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  current_user_message: string;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: PostMorningNudgeActiveState;
  note_information_inbound?: NoteInformation | null;
  db_context_pack: PostMorningNudgeContextPack;
  micro_memory_context: PostMorningNudgeMicroMemoryContext;
  platform_context: Record<string, unknown>;
  risk_context: Record<string, unknown>;
  available_inline_tools: string[];
  parent_flow_context: Record<string, unknown>;
  timezone: string;
  channel: string;
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
    conversation_context: PostMorningNudgeConversationContext;
  };
  note_information: NoteInformation | null;
  evidence: string[];
};

export type PostMorningNudgeEmotionalPresenceDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  current_user_message: string;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: PostMorningNudgeActiveState;
  note_information_inbound?: NoteInformation | null;
  db_context_pack: PostMorningNudgeContextPack;
  micro_memory_context: PostMorningNudgeMicroMemoryContext;
  platform_context: Record<string, unknown>;
  risk_context: Record<string, unknown>;
  available_inline_tools: string[];
  parent_flow_context: Record<string, unknown>;
  timezone: string;
  channel: string;
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
export const LAST_POST_MORNING_NUDGE_NOTE_INFORMATION_KEY =
  "__last_post_morning_nudge_note_information";

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
  const visibleData = recordOrEmpty(
    recordOrEmpty(visibleTask.conversation_context).known_values,
  );
  const riskScore = boundedRiskScore(root.risk_score);
  const output: PostMorningNudgeEmotionalPresenceDispatcherOutput = {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: riskScore,
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
      conversation_context: buildPostMorningConversationContext({
        state,
        visibleKind: emotionalPresenceVisibleTaskKind(visibleTask.kind),
        visibleData,
        assessment,
        evidence: stringArray(root.evidence),
        rawConversationContext: visibleTask.conversation_context,
      }),
    },
    note_information: requirePostMorningTransitionNoteInformation({
      raw: root.note_information,
      state,
      assessment,
      flowAction,
      riskScore,
    }),
    evidence: stringArray(root.evidence),
  };
  return output;
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
  const visibleData = recordOrEmpty(
    recordOrEmpty(visibleTask.conversation_context).known_values,
  );
  const riskScore = boundedRiskScore(root.risk_score);
  const output: PostMorningNudgeSuppressedActionDispatcherOutput = {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: riskScore,
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
      conversation_context: buildPostMorningConversationContext({
        state,
        visibleKind: suppressedActionVisibleTaskKind(visibleTask.kind),
        visibleData,
        assessment,
        evidence: stringArray(root.evidence),
        rawConversationContext: visibleTask.conversation_context,
      }),
    },
    note_information: requirePostMorningTransitionNoteInformation({
      raw: root.note_information,
      state,
      assessment,
      flowAction,
      riskScore,
    }),
    evidence: stringArray(root.evidence),
  };
  return output;
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
  const visibleData = recordOrEmpty(
    recordOrEmpty(visibleTask.conversation_context).known_values,
  );
  const riskScore = boundedRiskScore(root.risk_score);
  const output: PostMorningNudgeActionDispatcherOutput = {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: riskScore,
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
      conversation_context: buildPostMorningConversationContext({
        state,
        visibleKind: actionVisibleTaskKind(visibleTask.kind),
        visibleData,
        assessment,
        evidence: stringArray(root.evidence),
        rawConversationContext: visibleTask.conversation_context,
      }),
    },
    note_information: requirePostMorningTransitionNoteInformation({
      raw: root.note_information,
      state,
      assessment,
      flowAction,
      riskScore,
    }),
    evidence: stringArray(root.evidence),
  };
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
  const flowKind = args.sourceNudge.intended_followup_flow;
  return {
    skill_id: "post_morning_nudge",
    flow_kind: flowKind,
    status: "active",
    source_nudge: args.sourceNudge,
    activation_note_information: buildPostMorningActivationNoteInformation({
      sourceNudge: args.sourceNudge,
      flowKind,
    }),
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
  const stateWithoutNote: Omit<
    PostMorningNudgeActiveState,
    "activation_note_information"
  > = {
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
  return {
    ...stateWithoutNote,
    activation_note_information: normalizePostMorningActivationNoteInformation({
      raw: record.activation_note_information,
      state: stateWithoutNote,
    }),
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
  const activeAlias = next.active_skill_state as any;
  if (activeAlias?.skill_id === "post_morning_nudge") {
    delete next.active_skill_state;
  }
  return next;
}

export function resolvePostMorningNudgeDispatcher(
  state: PostMorningNudgeActiveState,
): PostMorningNudgeDispatcherId {
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

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function buildPostMorningNudgeDbContextPack(
  state: PostMorningNudgeActiveState,
): PostMorningNudgeContextPack {
  const source = state.source_nudge;
  return {
    source: "morning_nudge_v2_payload",
    freshness: "current_active_flow",
    confidence: "high",
    status: "bridge_provided",
    flow_kind: state.flow_kind,
    source_nudge_summary: summarizeSourceNudge(source),
    target_action_titles: stringArray(source.target_action_titles),
    target_item_titles: stringArray(source.target_item_titles),
    suppressed_action_titles: stringArray(source.suppressed_action_titles),
    suppression_reason: source.suppression_reason ?? null,
    morning_anchor: source.morning_anchor ?? null,
    posture: nullableString(source.posture),
    coach_intent: nullableString(source.coach_intent),
    evidence: [
      "active_state.source_nudge",
      `nudge_kind=${source.nudge_kind}`,
      `intended_followup_flow=${source.intended_followup_flow}`,
    ],
  };
}

export function buildPostMorningNudgeMicroMemoryContext(args: {
  state: PostMorningNudgeActiveState;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}): PostMorningNudgeMicroMemoryContext {
  const lastAssistant = args.recentMessages.slice().reverse().find((message) =>
    message.role === "assistant"
  );
  const items: PostMorningNudgeMicroMemoryContext["items"] = [];
  if (args.state.flow_kind === "emotional_presence" && lastAssistant) {
    items.push({
      summary:
        `Recent assistant context may help preserve the emotional thread: ${
          lastAssistant.content.slice(0, 180)
        }`,
      source: "thread_memory",
      linked_object: {
        type: "thread",
        id: null,
        label: "recent post-morning thread",
      },
      freshness: "recent",
      confidence: "medium",
      evidence: ["recent_messages.last_assistant"],
      sensitivity: "normal",
    });
  }
  return {
    items: items.slice(
      0,
      args.state.flow_kind === "emotional_presence" ? 2 : 0,
    ),
    exclusions: [
      "No raw memory dump.",
      "No safety memory unless safety_preempt is selected.",
      "No global emotional profile.",
    ],
    budget: {
      max_items: args.state.flow_kind === "emotional_presence" ? 2 : 0,
      reason: args.state.flow_kind === "emotional_presence"
        ? "Only a tiny recent thread hint can help avoid making the user repeat emotional context."
        : "The source morning nudge payload is the authoritative context for action and suppressed-action followups.",
    },
  };
}

function buildPostMorningConversationContext(args: {
  state: PostMorningNudgeActiveState;
  visibleKind: string;
  visibleData: Record<string, unknown>;
  assessment: PostMorningNudgeLocalAssessment;
  evidence: string[];
  rawConversationContext?: unknown;
}): PostMorningNudgeConversationContext {
  const provided = recordOrEmpty(args.rawConversationContext);
  const sourceSummary = nullableString(provided.source_nudge_summary) ??
    nullableString(args.visibleData.source_nudge_summary) ??
    summarizeSourceNudge(args.state.source_nudge);
  const knownValues = {
    ...recordOrEmpty(provided.known_values),
    target_action_titles: stringArray(args.visibleData.target_action_titles)
        .length > 0
      ? stringArray(args.visibleData.target_action_titles)
      : stringArray(args.state.source_nudge.target_action_titles),
    target_item_titles: stringArray(args.visibleData.target_item_titles)
        .length > 0
      ? stringArray(args.visibleData.target_item_titles)
      : stringArray(args.state.source_nudge.target_item_titles),
    suppressed_action_titles:
      stringArray(args.visibleData.suppressed_action_titles).length > 0
        ? stringArray(args.visibleData.suppressed_action_titles)
        : stringArray(args.state.source_nudge.suppressed_action_titles),
    suppression_reason: nullableString(args.visibleData.suppression_reason) ??
      args.state.source_nudge.suppression_reason ?? null,
    morning_anchor: args.state.source_nudge.morning_anchor ?? null,
    main_friction: nullableString(args.visibleData.main_friction) ??
      args.assessment.main_friction ?? null,
    next_step_candidate: nullableString(args.visibleData.next_step_candidate) ??
      args.assessment.next_step_candidate ?? null,
    scope_reduction_candidate: nullableString(
      args.visibleData.scope_reduction_candidate,
    ) ?? args.assessment.scope_reduction_candidate ?? null,
    main_need: nullableString(args.visibleData.main_need) ??
      args.assessment.main_need ?? null,
    minimal_save_candidate: nullableString(
      args.visibleData.minimal_save_candidate,
    ) ?? args.assessment.minimal_save_candidate ?? null,
    reopen_step_candidate: nullableString(
      args.visibleData.reopen_step_candidate,
    ) ?? args.assessment.reopen_step_candidate ?? null,
    main_emotion_or_context: nullableString(
      args.visibleData.main_emotion_or_context,
    ) ?? args.assessment.main_emotion_or_context ?? null,
    soft_next_step_candidate: nullableString(
      args.visibleData.soft_next_step_candidate,
    ) ?? args.assessment.soft_next_step_candidate ?? null,
    reactivation_candidate: nullableString(
      args.visibleData.reactivation_candidate,
    ) ?? args.assessment.reactivation_candidate ?? null,
    coach_intent: nullableString(args.visibleData.coach_intent) ??
      nullableString(args.state.source_nudge.coach_intent),
    action_readiness: args.assessment.action_readiness,
    emotional_load: args.assessment.emotional_load,
    support_need: args.assessment.support_need ?? null,
  };
  const doNotSay = [
    ...stringArray(provided.do_not_say),
    "Do not claim that a card, potion, reminder, preference, action, checkin, or plan patch was created.",
    args.state.flow_kind === "emotional_presence"
      ? "Do not invent a hidden target action."
      : "",
    args.state.flow_kind === "suppressed_action"
      ? "Do not claim the plan was modified, postponed, or lightened."
      : "",
  ].filter(Boolean);
  return {
    state_summary: nullableString(provided.state_summary) ??
      `${args.state.flow_kind} followup; status=${args.state.status}; turn=${args.state.turn_count}/${args.state.max_turns}.`,
    source_nudge_summary: sourceSummary,
    flow_kind: args.state.flow_kind,
    user_words: stringArray(provided.user_words),
    field_or_stage: nullableString(provided.field_or_stage) ??
      args.visibleKind,
    known_values: knownValues,
    missing_or_weak_values: stringArray(provided.missing_or_weak_values),
    selected_candidate: recordOrEmpty(provided.selected_candidate),
    handoff_data: recordOrEmpty(provided.handoff_data),
    tone_constraints: stringArray(provided.tone_constraints).length > 0
      ? stringArray(provided.tone_constraints)
      : [
        "short",
        "natural",
        "no pressure",
        "one visible move only",
      ],
    do_not_say: doNotSay,
    context_summary: nullableString(provided.context_summary) ??
      `${sourceSummary}; visible_task=${args.visibleKind}`,
    evidence_used: stringArray(provided.evidence_used).length > 0
      ? stringArray(provided.evidence_used)
      : args.evidence.slice(0, 8),
  };
}

function flowActionCategory(args: {
  flowKind: PostMorningNudgeFlowKind;
  flowAction: string;
  visibleKind: string;
}): PostMorningNudgeFlowActionCategory {
  if (args.flowAction === "safety_preempt") return "safety_preempt";
  if (args.flowAction === "exit_to_global_dispatcher") {
    return "exit_to_global_dispatcher";
  }
  if (
    args.flowAction === "cancel_flow" ||
    args.flowAction === "negative_nudge_feedback" ||
    args.flowAction === "support_not_today" ||
    args.flowAction === "confirm_no_action_today"
  ) return "stop_local_no_handoff";
  if (
    args.flowAction === "quick_close_ready" ||
    args.flowAction === "protective_close" ||
    args.flowAction === "presence_ack_close"
  ) return "complete_flow";
  if (
    [
      "ask_action_clarification",
      "ask_suppressed_action_clarification",
      "ask_support_preference",
      "clarify_emotional_need",
    ].includes(args.flowAction) ||
    [
      "ask_action_clarification",
      "ask_suppressed_action_clarification",
      "ask_support_preference",
      "clarify_emotional_need",
    ].includes(args.visibleKind)
  ) return "ask_clarification";
  if (
    [
      "repeat_nudge_context",
      "repeat_protective_context",
      "repeat_presence_context",
    ].includes(args.flowAction) ||
    [
      "repeat_context",
      "repeat_protective_context",
      "repeat_presence_context",
    ].includes(args.visibleKind)
  ) return "repeat_context";
  return "continue_local";
}

function targetDispatcherFromLikelyIntent(
  value: PostMorningNudgeLikelyIntent,
): NoteInformation["target_dispatcher"] {
  if (value === "select_state_potion") return "select_state_potion";
  if (value === "prepare_attack_card") return "prepare_attack_card";
  if (value === "prepare_defense_card") return "prepare_defense_card";
  if (value === "update_coach_preferences") return "update_coach_preferences";
  if (value === "product_help") return "product_help";
  return "global";
}

function likelyIntentFromTargetDispatcher(
  value: NoteInformation["target_dispatcher"],
): PostMorningNudgeLikelyIntent {
  if (value === "select_state_potion") return "select_state_potion";
  if (value === "prepare_attack_card") return "prepare_attack_card";
  if (value === "prepare_defense_card") return "prepare_defense_card";
  if (value === "update_coach_preferences") {
    return "update_coach_preferences";
  }
  if (value === "product_help") return "product_help";
  return "unknown";
}

function postMorningNudgeSourceFlowId(
  flowKind: PostMorningNudgeFlowKind,
): string {
  return `post_morning_nudge.${flowKind}`;
}

function postMorningNudgeTargetDispatcherId(
  flowKind: PostMorningNudgeFlowKind,
): NoteInformation["target_dispatcher"] {
  if (flowKind === "action") return "post_morning_nudge.action";
  if (flowKind === "suppressed_action") {
    return "post_morning_nudge.suppressed_action";
  }
  return "post_morning_nudge.emotional_presence";
}

function buildPostMorningActivationNoteInformation(args: {
  sourceNudge: MorningNudgePayloadV2;
  flowKind: PostMorningNudgeFlowKind;
}): NoteInformation {
  const targetDispatcher = postMorningNudgeTargetDispatcherId(args.flowKind);
  const sourceSummary = summarizeSourceNudge(args.sourceNudge);
  const structuredContext = {
    source_flow: "morning_nudge_v2_event",
    target_dispatcher: targetDispatcher,
    handoff_reason: "bridge",
    user_message_summary:
      "The next user message is a reply to the morning_nudge_v2 event.",
    active_flow_summary: sourceSummary,
    collected_state: {
      event_context: args.sourceNudge.event_context,
      nudge_kind: args.sourceNudge.nudge_kind,
      intended_followup_flow: args.sourceNudge.intended_followup_flow,
      posture: args.sourceNudge.posture,
      coach_intent: args.sourceNudge.coach_intent,
      target_action_titles: stringArray(args.sourceNudge.target_action_titles),
      target_item_titles: stringArray(args.sourceNudge.target_item_titles),
      suppressed_action_titles: stringArray(
        args.sourceNudge.suppressed_action_titles,
      ),
      suppression_reason: args.sourceNudge.suppression_reason ?? null,
      source_reason: args.sourceNudge.source_reason,
      sent_at: args.sourceNudge.sent_at,
    },
    unresolved_questions: [],
    confidence: "high",
    evidence: [
      "process-checkins persisted morning_nudge_v2 local flow state",
      `nudge_kind=${args.sourceNudge.nudge_kind}`,
      `intended_followup_flow=${args.sourceNudge.intended_followup_flow}`,
    ],
    recommended_next_focus: args.flowKind,
  };
  return createNoteInformation({
    source_flow_id: "morning_nudge_v2_event",
    source_flow_presentation:
      "System morning nudge event that opened a post-morning local followup.",
    source_flow_state_summary: sourceSummary,
    handoff_reason: "bridge",
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher: JSON.stringify(structuredContext),
    target_local_dispatcher_hint:
      "Use the morning nudge payload as the source of truth for this first local followup turn.",
    structured_context: structuredContext,
    risk_score: 0,
  });
}

function normalizePostMorningActivationNoteInformation(args: {
  raw: unknown;
  state: Omit<PostMorningNudgeActiveState, "activation_note_information">;
}): NoteInformation {
  const fallback = buildPostMorningActivationNoteInformation({
    sourceNudge: args.state.source_nudge,
    flowKind: args.state.flow_kind,
  });
  return args.raw && typeof args.raw === "object" &&
      !Array.isArray(args.raw)
    ? normalizeNoteInformation(args.raw, fallback)
    : fallback;
}

function handoffReasonForExitReason(
  reason: PostMorningNudgeExitReason,
): "topic_change" | "safety" | "explicit_user_request" {
  if (reason === "safety") return "safety";
  return reason === "explicit_tool_request" ||
      reason === "preference_update" ||
      reason === "product_help" ||
      reason === "status_question"
    ? "explicit_user_request"
    : "topic_change";
}

function exitReasonFromNoteInformation(
  note: NoteInformation,
): PostMorningNudgeExitReason {
  if (note.target_dispatcher === "safety_crisis") return "safety";
  if (note.handoff_reason === "explicit_user_request") {
    return note.target_dispatcher === "product_help"
      ? "product_help"
      : "explicit_tool_request";
  }
  return note.handoff_reason === "topic_change" ? "topic_change" : "unknown";
}

function buildPostMorningTransitionNoteInformation(args: {
  state: PostMorningNudgeActiveState;
  assessment: PostMorningNudgeLocalAssessment;
  reason: PostMorningNudgeExitReason;
  likelyIntent?: PostMorningNudgeLikelyIntent;
  userIntentSummary?: string | null;
  why?: string | null;
  riskScore?: number | null;
  rawNoteInformation?: unknown;
}): NoteInformation {
  const targetDispatcher = args.reason === "safety"
    ? "safety_crisis"
    : targetDispatcherFromLikelyIntent(args.likelyIntent ?? "unknown");
  const sourceFlowId = postMorningNudgeSourceFlowId(args.state.flow_kind);
  const sourceSummary = summarizeSourceNudge(args.state.source_nudge);
  const userSummary = cleanText(args.userIntentSummary) ||
    (args.reason === "safety"
      ? "User message contains a safety signal that must be handled by safety."
      : "User message needs another dispatcher outside post morning nudge.");
  const structuredContext = {
    source_flow: sourceFlowId,
    target_dispatcher: targetDispatcher,
    handoff_reason: handoffReasonForExitReason(args.reason),
    user_message_summary: userSummary,
    active_flow_summary: sourceSummary,
    collected_state: {
      skill_id: "post_morning_nudge",
      flow_kind: args.state.flow_kind,
      source_nudge_summary: sourceSummary,
      target_action_titles: stringArray(
        args.state.source_nudge.target_action_titles,
      ),
      suppressed_action_titles: stringArray(
        args.state.source_nudge.suppressed_action_titles,
      ),
      suppression_reason: args.state.source_nudge.suppression_reason,
      last_local_assessment: JSON.stringify(args.assessment),
    },
    unresolved_questions: [],
    confidence: "medium",
    evidence: [
      userSummary,
      cleanText(args.why),
      `flow_kind=${args.state.flow_kind}`,
    ].filter(Boolean),
    recommended_next_focus: args.reason === "safety"
      ? "safety_crisis"
      : args.likelyIntent ?? "unknown",
  };
  const fallback = createNoteInformation({
    source_flow_id: sourceFlowId,
    source_flow_state_summary: JSON.stringify(args.assessment),
    handoff_reason: handoffReasonForExitReason(args.reason),
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher: JSON.stringify(structuredContext),
    target_local_dispatcher_hint: targetDispatcher === "safety_crisis"
      ? "Use the source nudge context only as background; safety owns the turn."
      : targetDispatcher !== "global"
      ? "Use the post-morning nudge context as source information, then run the target dispatcher contract normally."
      : null,
    structured_context: structuredContext,
    risk_score: args.riskScore ?? 0,
  });
  return args.rawNoteInformation &&
      typeof args.rawNoteInformation === "object" &&
      !Array.isArray(args.rawNoteInformation)
    ? normalizeNoteInformation(args.rawNoteInformation, fallback)
    : fallback;
}

function requirePostMorningTransitionNoteInformation(args: {
  raw: unknown;
  state: PostMorningNudgeActiveState;
  assessment: PostMorningNudgeLocalAssessment;
  flowAction: string;
  riskScore: number;
}): NoteInformation | null {
  if (
    args.flowAction !== "exit_to_global_dispatcher" &&
    args.flowAction !== "safety_preempt"
  ) return null;
  if (!args.raw || typeof args.raw !== "object" || Array.isArray(args.raw)) {
    throw new Error("post_morning_nudge_note_information_required");
  }
  return buildPostMorningTransitionNoteInformation({
    state: args.state,
    assessment: args.assessment,
    reason: args.flowAction === "safety_preempt" ? "safety" : "unknown",
    riskScore: args.riskScore,
    rawNoteInformation: args.raw,
  });
}

function logPostMorningNoteTransition(args: {
  requestId?: string | null;
  note: NoteInformation | null | undefined;
  flowAction: string;
}): void {
  if (!args.note) return;
  console.info("[PostMorningNudge] note_information_created", {
    ...noteInformationForTrace(args.note),
    request_id: args.requestId ?? null,
    flow_action: args.flowAction,
    transition_tag: args.note.target_dispatcher === "safety_crisis"
      ? "local_to_safety_with_note"
      : "local_to_global_with_note",
  });
}

function buildPostMorningLocalHandoffNote(args: {
  state: PostMorningNudgeActiveState;
  assessment: PostMorningNudgeLocalAssessment;
  noteInformation: NoteInformation;
  reason?: PostMorningNudgeExitReason;
  likelyIntent?: PostMorningNudgeLikelyIntent;
  fallbackUserSummary: string;
  constraints?: string[];
}): PostMorningNudgeLocalHandoffNote {
  const structuredContext = recordOrEmpty(
    args.noteInformation.structured_context,
  );
  const collectedState = recordOrEmpty(structuredContext.collected_state);
  const sourceNudgeSummary =
    nullableString(collectedState.source_nudge_summary) ??
      summarizeSourceNudge(args.state.source_nudge);
  const targetActionTitles = stringArray(collectedState.target_action_titles);
  const suppressedActionTitles = stringArray(
    collectedState.suppressed_action_titles,
  );
  const lastAssessment = nullableString(collectedState.last_local_assessment) ??
    JSON.stringify(args.assessment);
  const userSummary = nullableString(structuredContext.user_message_summary) ??
    args.fallbackUserSummary;
  const targetDispatcher = args.noteInformation.target_dispatcher;
  return {
    reason: args.reason ?? exitReasonFromNoteInformation(args.noteInformation),
    user_message_summary: userSummary,
    flow_summary: nullableString(structuredContext.active_flow_summary) ??
      sourceNudgeSummary,
    source_flow: nullableString(structuredContext.source_flow) ??
      postMorningNudgeSourceFlowId(args.state.flow_kind),
    target_dispatcher: targetDispatcher,
    collected_state: {
      skill_id: "post_morning_nudge",
      flow_kind: args.state.flow_kind,
      source_nudge_summary: sourceNudgeSummary,
      target_action_titles: targetActionTitles.length > 0
        ? targetActionTitles
        : stringArray(args.state.source_nudge.target_action_titles),
      suppressed_action_titles: suppressedActionTitles.length > 0
        ? suppressedActionTitles
        : stringArray(args.state.source_nudge.suppressed_action_titles),
      suppression_reason: nullableString(collectedState.suppression_reason) ??
        args.state.source_nudge.suppression_reason,
      last_local_assessment: lastAssessment,
    },
    recommended_next_focus: nullableString(
      structuredContext.recommended_next_focus,
    ) ?? args.likelyIntent ??
      likelyIntentFromTargetDispatcher(targetDispatcher),
    constraints: args.constraints ?? [
      "Do not treat this as post_morning_nudge continuation unless selected again.",
    ],
    note_information: args.noteInformation,
  };
}

export function buildPostMorningNudgeLocalHandoffNote(args: {
  state: PostMorningNudgeActiveState;
  reason?: PostMorningNudgeExitReason;
  userIntentSummary?: string | null;
  likelyIntent?: PostMorningNudgeLikelyIntent;
  why?: string | null;
}): PostMorningNudgeLocalHandoffNote {
  const reason = args.reason ?? "unknown";
  const userSummary = cleanText(args.userIntentSummary) ||
    "User message needs another dispatcher outside post morning nudge.";
  const noteInformation = buildPostMorningTransitionNoteInformation({
    state: args.state,
    assessment: args.state.local_assessment,
    reason,
    likelyIntent: args.likelyIntent,
    userIntentSummary: userSummary,
    why: cleanText(args.why) ||
      "Local post morning nudge dispatcher explicitly exited.",
    riskScore: reason === "safety" ? 10 : 0,
  });
  return buildPostMorningLocalHandoffNote({
    state: args.state,
    assessment: args.state.local_assessment,
    noteInformation,
    reason,
    likelyIntent: args.likelyIntent,
    fallbackUserSummary: userSummary,
    constraints: [
      "Do not treat this as post_morning_nudge continuation unless selected again.",
    ],
  });
}

export function actionDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow post_morning_nudge.action.",
    "Sophia a envoye ce matin un morning_nudge_v2 de type action_nudge. Le user vient de repondre a ce nudge.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON strict conforme au contrat.",
    "But: determiner si le user est pret, hesite, a besoin d'une premiere marche, d'une reduction de scope, d'une aide sur bloqueur, d'un soutien pas-aujourd'hui, d'une reconnexion au sens, ou si le message doit sortir vers le dispatcher global.",
    "Actions possibles: quick_close_ready, motivate_light, choose_first_step, reduce_scope, handle_blocker, support_not_today, meaning_reconnect, ask_action_clarification, repeat_nudge_context, negative_nudge_feedback, cancel_flow, exit_to_global_dispatcher, safety_preempt.",
    "Ne fais aucune regex metier, aucun mot-cle isole, aucune creation ou modification durable, aucune confirmation executable, aucun token de confirmation.",
    "Ce contrat ne contient pas exit_memo, response_contract, no_tooling, read_scope, grounding, product_tool_boundary, question_constraints ni handoff_to_local_dispatcher: ne les ajoute pas.",
    "visible_task doit contenir conversation_context: un contexte filtre et suffisant pour le prompt visible. Ne mets pas de DB brute ni de micro_memory brute dans le visible.",
    "Si un autre dispatcher doit reprendre, produis note_information exploitable. Le prompt visible local ne verra pas cette note.",
    "Si le user demande explicitement une carte, potion, rappel, preference, modification de plan, aide produit, status, nouvel objectif ou autre sujet, retourne exit_to_global_dispatcher avec note_information exploitable.",
    "Si flow_action=quick_close_ready, state_updates.close_after_visible=true. Si flow_action=cancel_flow, ferme le flow. Si flow_action=exit_to_global_dispatcher ou safety_preempt, note_information est obligatoire et aucun message local ne sera emis.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour. Elle doit refleter le message courant dans le contexte du nudge, pas seulement l'etat precedent. Utilise quick_close_ready si le user accepte clairement d'agir maintenant; motivate_light si hesitation legere; choose_first_step si le user veut commencer mais manque de premiere marche; reduce_scope si l'action parait trop lourde; handle_blocker si un bloqueur concret est donne; support_not_today ou cancel_flow si le user arrete sans nouveau sujet; exit_to_global_dispatcher si le message demande une autre capacite; safety_preempt si un signal safety reel apparait.",
    "- confidence: high si l'intention courante est claire; medium si le sens est probable mais incomplet; low si la reponse est vague, contradictoire ou demande une clarification prudente. N'utilise pas high pour une inference fragile.",
    "- risk_score: score utile au flow local. 0-2 pour normal; 3-6 pour charge forte non safety; 7+ uniquement si safety plausible. N'invente pas de safety; si safety reelle, flow_action=safety_preempt et note_information cible safety_crisis.",
    "- local_assessment.action_readiness: resume la readiness actuelle pour l'action du nudge. ready, hesitant, blocked, overloaded, not_today ou unknown. Ne transforme pas une hypothese en fait durable.",
    "- local_assessment.motivation_need: none/light/medium/high/unknown selon le besoin visible de soutien. Ne cree pas de profil motivationnel global.",
    "- local_assessment.emotional_load: low/medium/high/unknown selon le message courant et le contexte compact. Ne diagnostique pas.",
    "- local_assessment.user_wants_conversation: true si le user ouvre un echange; false si le tour est un close net. Ce champ aide le reducer a choisir fermeture vs continuation.",
    "- local_assessment.target_action_reference: titre ou reference de l'action du nudge si utile; null si non pertinent ou incertain.",
    "- local_assessment.main_friction: friction exprimee par le user. Null si absente. Ne l'invente pas depuis db_context_pack seul.",
    "- local_assessment.next_step_candidate: premiere marche candidate si le user veut demarrer ou demande comment commencer. Null si stop, exit, safety ou absence de premiere marche.",
    "- local_assessment.scope_reduction_candidate: version plus petite si overload/scope trop lourd. Null si le user est pret ou veut autre chose.",
    "- state_updates.status: active si le flow continue; closing/closed si le visible doit terminer; exit_to_global si sortie global; safety si safety_preempt. Ne laisse pas active pour un stop net.",
    "- state_updates.turn_count_increment: normalement 1. Ne mets pas 0 pour eviter de prolonger artificiellement le flow.",
    "- state_updates.close_after_visible: true pour quick_close_ready, support_not_today, negative_nudge_feedback, cancel_flow, exit_to_global_dispatcher et safety_preempt; false seulement si un prochain tour local est vraiment utile.",
    "- visible_task.kind: stage visible exact, jamais generique. Aligne-le avec flow_action: choose_first_step -> choose_first_step, reduce_scope -> reduce_scope, handle_blocker -> blocker_help, cancel_flow/exit local -> exit_or_cancel, safety_preempt -> safety.",
    "- visible_task.instruction: consigne courte pour le visible agent. Laisse vide seulement si kind+conversation_context suffisent. Ne mets jamais un message visible complet.",
    "- visible_task.conversation_context: seul contexte donne au prompt visible. Inclure source_nudge_summary, flow_kind, user_words utiles, known_values, missing_or_weak_values, tone_constraints, do_not_say, evidence_used. Ne jamais inclure DB brute, micro_memory brute, note_information brute ni secrets.",
    "- note_information: null quand le flow reste local ou stoppe sans nouveau dispatcher. Obligatoire pour exit_to_global_dispatcher et safety_preempt. Remplis les champs reels du contrat NoteInformation: source_flow_id, source_flow_presentation, source_flow_state_summary, handoff_reason, target_dispatcher, handoff_context_for_next_dispatcher, target_local_dispatcher_hint, user_words, structured_context, risk_score, no_chat_mutation. Mets user_message_summary, active_flow_summary, collected_state, unresolved_questions, confidence, evidence et recommended_next_focus dans structured_context si utiles; ne les ajoute jamais comme champs top-level inventes. Elle est consommee par le dispatcher cible, jamais par le prompt visible.",
    "- evidence: indices semantiques reellement utilises: mots du user, nudge/action cible, friction explicite, demande d'outil, signal safety. Pas de pseudo-preuves ni de citations inventees.",
    "",
    "Transition Rules:",
    "- Continuation locale: utilise motivate_light, choose_first_step, reduce_scope, handle_blocker, meaning_reconnect, ask_action_clarification ou repeat_nudge_context; global dispatcher reste bloque.",
    "- Stop local sans handoff: support_not_today, negative_nudge_feedback ou cancel_flow ferment sans global si aucun nouveau sujet clair n'est demande.",
    "- Exit global: exit_to_global_dispatcher seulement pour autre sujet/capacite claire; note_information obligatoire; aucun message visible local.",
    "- Safety: safety_preempt pour risque reel; note_information cible safety_crisis; global normal ne fonctionne pas.",
    "",
    "Decision Examples (non-visible, exactly two):",
    '{"example_id":"action_continue","flow_action":"choose_first_step","confidence":"high","risk_score":0,"local_assessment":{"action_readiness":"hesitant","motivation_need":"light","emotional_load":"low","user_wants_conversation":true,"target_action_reference":"Marcher 10 min","main_friction":"ne sait pas par ou commencer","next_step_candidate":"mettre les chaussures","scope_reduction_candidate":null},"state_updates":{"status":"active","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"choose_first_step","instruction":"Proposer une seule premiere marche.","conversation_context":{"flow_kind":"action","user_words":["je ne sais pas par ou commencer"],"known_values":{"next_step_candidate":"mettre les chaussures"},"missing_or_weak_values":[],"tone_constraints":["court","sans pression"],"do_not_say":["ne dis pas qu une action a ete creee"],"evidence_used":["demande une premiere marche"]}},"note_information":null,"evidence":["user demande comment commencer"]}',
    '{"example_id":"action_exit","flow_action":"exit_to_global_dispatcher","confidence":"high","risk_score":0,"local_assessment":{"action_readiness":"unknown","motivation_need":"unknown","emotional_load":"low","user_wants_conversation":true,"target_action_reference":"Marcher 10 min","main_friction":null,"next_step_candidate":null,"scope_reduction_candidate":null},"state_updates":{"status":"exit_to_global","turn_count_increment":1,"close_after_visible":true},"visible_task":{"kind":"exit_or_cancel","instruction":"","conversation_context":{"flow_kind":"action","user_words":["prepare moi une carte d attaque"],"known_values":{},"missing_or_weak_values":[],"tone_constraints":["no local visible message"],"do_not_say":["ne reponds pas au user"],"evidence_used":["demande explicite carte"]}},"note_information":{"source_flow_id":"post_morning_nudge.action","source_flow_presentation":"Morning action nudge followup.","source_flow_state_summary":"Action nudge for Marcher 10 min.","handoff_reason":"explicit_user_request","target_dispatcher":"prepare_attack_card","handoff_context_for_next_dispatcher":"Le user quitte le followup du nudge et demande une carte d attaque.","target_local_dispatcher_hint":null,"user_words":["prepare moi une carte d attaque"],"structured_context":{"user_message_summary":"demande carte d attaque","active_flow_summary":"post morning action nudge","collected_state":{"target_action":"Marcher 10 min"},"unresolved_questions":[],"confidence":"high","evidence":["demande explicite carte"],"recommended_next_focus":"prepare_attack_card"},"risk_score":0,"no_chat_mutation":{"db_write_committed":false,"potion_session_created":false,"scheduled_checkin_created":false,"recurring_reminder_created":false,"executable_confirmation_generated":false}},"evidence":["demande explicite d une autre capacite"]}',
    "Retourne uniquement le JSON.",
  ].join("\n");
}

export async function runPostMorningNudgeActionDispatcher(
  input: PostMorningNudgeActionDispatcherInput,
): Promise<PostMorningNudgeActionDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "post_morning_nudge_action_dispatcher",
    standard_dispatcher_input: {
      current_user_message: input.current_user_message,
      recent_messages: input.recent_messages,
      active_flow_state: input.active_state,
      note_information_inbound: input.note_information_inbound ?? null,
      db_context_pack: input.db_context_pack,
      micro_memory_context: input.micro_memory_context,
      platform_context: input.platform_context,
      risk_context: input.risk_context,
      available_inline_tools: input.available_inline_tools,
      parent_flow_context: input.parent_flow_context,
      timezone: input.timezone,
      channel: input.channel,
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
        conversation_context: "object",
      },
      note_information:
        "object when flow_action exits to another dispatcher or safety_preempt, otherwise null",
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
    "Tu utilises uniquement visible_task.conversation_context pour le contenu metier. Tu ne refais pas la decision du dispatcher.",
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
    conversation_context: input.decision.visible_task.conversation_context,
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

export function suppressedActionDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow post_morning_nudge.suppressed_action.",
    "Sophia a envoye ce matin un morning_nudge_v2 de type suppressed_action_nudge: il y avait une action prevue, mais Sophia a choisi de ne pas la pousser a cause de l'etat du user.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON strict conforme au contrat.",
    "But: preserver la protection initiale, soutenir sans pression, proposer une micro-version uniquement si le user veut sauver quelque chose, ou sortir vers le global si le message quitte ce followup.",
    "Actions possibles: protective_close, support_emotion, offer_minimal_save, confirm_no_action_today, reopen_action_gently, ask_suppressed_action_clarification, repeat_protective_context, negative_nudge_feedback, cancel_flow, exit_to_global_dispatcher, safety_preempt.",
    "Ne fais aucune regex metier, aucun mot-cle isole, aucune creation ou modification durable, aucune confirmation executable, aucun token de confirmation.",
    "Ce contrat ne contient pas exit_memo, response_contract, no_tooling, read_scope, grounding, product_tool_boundary, question_constraints ni handoff_to_local_dispatcher: ne les ajoute pas.",
    "visible_task doit contenir conversation_context: un contexte filtre et suffisant pour le prompt visible. Ne mets pas de DB brute ni de micro_memory brute dans le visible.",
    "Si un autre dispatcher doit reprendre, produis note_information exploitable. Le prompt visible local ne verra pas cette note.",
    "Ne pousse pas l'action par defaut. Ne dis jamais que le plan est modifie, reporte, allege ou supprime.",
    "Si le user demande explicitement une carte, potion, rappel, preference, modification de plan, aide produit, status, nouvel objectif ou autre sujet, retourne exit_to_global_dispatcher avec note_information exploitable.",
    "Si le user veut quand meme sauver une micro-version ou avancer, reste dans le flow local avec offer_minimal_save ou reopen_action_gently.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour. Elle doit respecter la protection initiale du nudge. Utilise protective_close si le user accuse reception; support_emotion si le besoin est emotionnel; offer_minimal_save si le user veut sauver une micro-partie; confirm_no_action_today si le user refuse d'agir aujourd'hui; reopen_action_gently si le user veut finalement avancer; repeat_protective_context si le user demande pourquoi l'action n'a pas ete poussee; exit_to_global_dispatcher pour autre capacite claire; safety_preempt pour safety reelle.",
    "- confidence: high si l'intention courante est claire; medium si probable mais incomplete; low si le user est vague ou si pousser l'action serait risqué.",
    "- risk_score: 0-2 normal; 3-6 charge emotionnelle/fatigue sans safety; 7+ seulement pour safety plausible. Ne confonds pas fatigue avec crise safety; si safety reelle, flow_action=safety_preempt.",
    "- local_assessment.action_readiness: wants_minimal, wants_full, not_today, needs_support, unclear ou unknown. Ce champ exprime l'attitude envers l'action supprimee, pas envers un objectif global.",
    "- local_assessment.motivation_need: besoin de soutien motivationnel visible. Ne l'utilise pas pour pousser l'action par defaut.",
    "- local_assessment.emotional_load: charge percue dans le message courant. Pas de diagnostic ni profil emotionnel global.",
    "- local_assessment.user_wants_conversation: true si le user ouvre un soutien ou une precision; false si le user ferme nettement.",
    "- local_assessment.suppression_still_valid: true quand la protection reste pertinente; false seulement si le user veut clairement rouvrir l'action. Ne mets pas false juste parce que l'action existe.",
    "- local_assessment.target_action_reference: action supprimee si utile; null si le tour porte sur emotion, stop, safety ou autre sujet.",
    "- local_assessment.main_need: rest/support/minimal_progress/clarity/space/unknown selon le besoin actuel. Ne transforme pas clarity en potion sauf demande explicite de potion ou autre flow.",
    "- local_assessment.minimal_save_candidate: micro-version uniquement si le user veut sauver quelque chose. Null si repos/support/stop/exit.",
    "- local_assessment.reopen_step_candidate: premiere marche douce si le user veut rouvrir l'action. Null sinon.",
    "- state_updates.status: active si soutien/micro-version continue; closing/closed si protective_close, confirm_no_action_today, negative_nudge_feedback ou cancel_flow; exit_to_global pour exit; safety pour safety_preempt.",
    "- state_updates.turn_count_increment: normalement 1.",
    "- state_updates.close_after_visible: true pour protective_close, confirm_no_action_today, negative_nudge_feedback, cancel_flow, exit_to_global_dispatcher, safety_preempt; false si une micro-suite locale est utile.",
    "- visible_task.kind: stage exact: support_emotion -> soft_support; offer_minimal_save -> offer_minimal_save; reopen_action_gently -> reopen_action_gently; confirm_no_action_today -> confirm_no_action_today; cancel_flow -> exit_or_cancel; safety_preempt -> safety.",
    "- visible_task.instruction: consigne courte pour visible agent, pas un message visible.",
    "- visible_task.conversation_context: seul contexte visible-safe. Inclure raison de suppression, action supprimee si utile, besoin actuel, limites de ton, incertitudes et do_not_say. Ne jamais inclure DB brute, micro_memory brute ni note_information brute.",
    "- note_information: null pour continuation ou stop local sans autre dispatcher. Obligatoire pour exit_to_global_dispatcher et safety_preempt. Utilise les champs reels NoteInformation: source_flow_id, source_flow_presentation, source_flow_state_summary, handoff_reason, target_dispatcher, handoff_context_for_next_dispatcher, target_local_dispatcher_hint, user_words, structured_context, risk_score, no_chat_mutation. Mets les details comme user_message_summary, collected_state, unresolved_questions, evidence et recommended_next_focus dans structured_context, pas comme champs top-level inventes. Elle cible global/capacite ou safety_crisis et n'est jamais transmise brute au visible prompt.",
    "- evidence: mots du user et signaux semantiques utilises: refus d'agir, besoin de repos, demande de micro-version, demande d'outil, safety. Pas de pseudo-preuves.",
    "",
    "Transition Rules:",
    "- Continuation locale: support_emotion, offer_minimal_save, reopen_action_gently, ask_suppressed_action_clarification ou repeat_protective_context.",
    "- Stop local sans handoff: protective_close, confirm_no_action_today, negative_nudge_feedback ou cancel_flow; pas de global sur le meme tour.",
    "- Exit global: exit_to_global_dispatcher uniquement si autre capacite claire; note_information obligatoire; aucun message visible local.",
    "- Safety: safety_preempt avec note_information cible safety_crisis; global normal bloque.",
    "",
    "Decision Examples (non-visible, exactly two):",
    '{"example_id":"suppressed_continue","flow_action":"support_emotion","confidence":"high","risk_score":2,"local_assessment":{"action_readiness":"needs_support","motivation_need":"none","emotional_load":"medium","user_wants_conversation":true,"suppression_still_valid":true,"target_action_reference":"Ranger 5 min","main_need":"support","minimal_save_candidate":null,"reopen_step_candidate":null},"state_updates":{"status":"active","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"soft_support","instruction":"Soutenir sans pousser l action.","conversation_context":{"flow_kind":"suppressed_action","user_words":["je prefere y aller doucement"],"known_values":{"suppression_reason":"high_emotional_load","main_need":"support"},"missing_or_weak_values":[],"tone_constraints":["doux","sans pression"],"do_not_say":["ne dis pas que le plan est modifie"],"evidence_used":["demande de douceur"]}},"note_information":null,"evidence":["le user demande douceur et pas action"]}',
    '{"example_id":"suppressed_safety","flow_action":"safety_preempt","confidence":"high","risk_score":9,"local_assessment":{"action_readiness":"unknown","motivation_need":"unknown","emotional_load":"high","user_wants_conversation":true,"suppression_still_valid":true,"target_action_reference":"Ranger 5 min","main_need":"unknown","minimal_save_candidate":null,"reopen_step_candidate":null},"state_updates":{"status":"safety","turn_count_increment":1,"close_after_visible":true},"visible_task":{"kind":"safety","instruction":"","conversation_context":{"flow_kind":"suppressed_action","user_words":["je ne suis pas en securite"],"known_values":{},"missing_or_weak_values":["safety details"],"tone_constraints":["no local visible message"],"do_not_say":["ne coache pas l action"],"evidence_used":["signal safety"]}},"note_information":{"source_flow_id":"post_morning_nudge.suppressed_action","source_flow_presentation":"Protective suppressed action nudge followup.","source_flow_state_summary":"Action intentionally not pushed because of high emotional load.","handoff_reason":"safety","target_dispatcher":"safety_crisis","handoff_context_for_next_dispatcher":"Signal safety pendant un nudge protecteur.","target_local_dispatcher_hint":null,"user_words":["je ne suis pas en securite"],"structured_context":{"user_message_summary":"signal safety","active_flow_summary":"protective post morning nudge","collected_state":{"suppressed_action":"Ranger 5 min","suppression_reason":"high_emotional_load"},"unresolved_questions":["niveau de danger immediat"],"confidence":"high","evidence":["signal safety explicite"],"recommended_next_focus":"safety_crisis"},"risk_score":9,"no_chat_mutation":{"db_write_committed":false,"potion_session_created":false,"scheduled_checkin_created":false,"recurring_reminder_created":false,"executable_confirmation_generated":false}},"evidence":["signal safety explicite"]}',
    "Retourne uniquement le JSON.",
  ].join("\n");
}

export async function runPostMorningNudgeSuppressedActionDispatcher(
  input: PostMorningNudgeSuppressedActionDispatcherInput,
): Promise<PostMorningNudgeSuppressedActionDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "post_morning_nudge_suppressed_action_dispatcher",
    standard_dispatcher_input: {
      current_user_message: input.current_user_message,
      recent_messages: input.recent_messages,
      active_flow_state: input.active_state,
      note_information_inbound: input.note_information_inbound ?? null,
      db_context_pack: input.db_context_pack,
      micro_memory_context: input.micro_memory_context,
      platform_context: input.platform_context,
      risk_context: input.risk_context,
      available_inline_tools: input.available_inline_tools,
      parent_flow_context: input.parent_flow_context,
      timezone: input.timezone,
      channel: input.channel,
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
        conversation_context: "object",
      },
      note_information:
        "object when flow_action exits to another dispatcher or safety_preempt, otherwise null",
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
    "Tu utilises uniquement visible_task.conversation_context pour le contenu metier. Tu ne refais pas la decision du dispatcher.",
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
    conversation_context: input.decision.visible_task.conversation_context,
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

export function emotionalPresenceDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow post_morning_nudge.emotional_presence.",
    "Sophia a envoye ce matin un morning_nudge_v2 de type emotional_presence_nudge: l'objectif etait une presence emotionnelle ou une porte ouverte, sans action cible cachee.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON strict conforme au contrat.",
    "But: reconnaitre une reception simple, tenir un espace d'ecoute, demander la preference de soutien, proposer un point d'appui tres doux si le user le demande, reactiver doucement un cap si le user le demande, clarifier le besoin emotionnel, ou sortir vers le global si le message quitte ce followup.",
    "Actions possibles: presence_ack_close, hold_space_support, ask_support_preference, offer_soft_next_step, reactivate_gently, clarify_emotional_need, repeat_presence_context, negative_nudge_feedback, cancel_flow, exit_to_global_dispatcher, safety_preempt.",
    "Ne fais aucune regex metier, aucun mot-cle isole, aucune creation ou modification durable, aucune confirmation executable, aucun token de confirmation.",
    "Ce contrat ne contient pas exit_memo, response_contract, no_tooling, read_scope, grounding, product_tool_boundary, question_constraints ni handoff_to_local_dispatcher: ne les ajoute pas.",
    "visible_task doit contenir conversation_context: un contexte filtre et suffisant pour le prompt visible. Ne mets pas de DB brute ni de micro_memory brute dans le visible.",
    "Si un autre dispatcher doit reprendre, produis note_information exploitable. Le prompt visible local ne verra pas cette note.",
    "N'invente jamais d'action cible. Ne revele aucun target action cache, car ce flow n'en a pas. Ne pousse pas l'execution, la responsabilisation ou un plan.",
    "Si le user demande explicitement une carte, potion, rappel, preference, modification de plan, aide produit, status, nouvel objectif ou autre sujet, retourne exit_to_global_dispatcher avec note_information exploitable.",
    "Si le user demande 'c'etait quoi l'action' ou equivalent, reste local avec repeat_presence_context et explique qu'il n'y avait pas d'action cachee dans ce nudge.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour. Elle doit partir du message courant et du fait que ce nudge n'avait aucune action cachee. Utilise presence_ack_close pour reception simple; hold_space_support pour besoin d'ecoute; ask_support_preference si le besoin de soutien est vague; offer_soft_next_step si le user demande un point d'appui doux; reactivate_gently seulement si le user demande une direction; clarify_emotional_need si l'emotion ou le besoin est ambigu; repeat_presence_context si le user demande le contexte; exit_to_global_dispatcher pour autre capacite claire; safety_preempt pour safety reelle.",
    "- confidence: high si l'intention est explicite; medium si le besoin probable demande encore precision; low si le user est trop vague ou si une clarification prudente est preferable.",
    "- risk_score: 0-2 normal; 3-6 charge emotionnelle sans safety; 7+ seulement pour safety plausible. Ne cree pas de safety a partir d'une simple tristesse; si safety reelle, safety_preempt.",
    "- local_assessment.emotional_load: low/medium/high/unknown selon le tour courant. Pas de diagnostic, pas de profil emotionnel global.",
    "- local_assessment.support_need: none/listen/soft_next_step/reactivation/space/clarity/unknown selon ce que le user demande vraiment. Une demande de clarity conversationnelle reste locale; une demande explicite de potion sort global.",
    "- local_assessment.user_wants_conversation: true si le user ouvre ou accepte un soutien; false si reception simple ou stop net.",
    "- local_assessment.action_readiness: not_applicable par defaut; wants_direction seulement si le user demande une direction douce; not_today si le user refuse l'action/productivite; unknown si incertain.",
    "- local_assessment.main_emotion_or_context: emotion/contexte exprime en quelques mots; null si non dit. Ne l'invente pas depuis un profil.",
    "- local_assessment.soft_next_step_candidate: point d'appui doux si demande ou utile; null si hold_space, stop, exit ou safety.",
    "- local_assessment.reactivation_candidate: cap doux si le user demande a se remettre en mouvement; null sinon.",
    "- state_updates.status: active si soutien/clarification continue; closing/closed si close, negative feedback ou cancel; exit_to_global pour exit; safety pour safety_preempt.",
    "- state_updates.turn_count_increment: normalement 1.",
    "- state_updates.close_after_visible: true pour presence_ack_close, negative_nudge_feedback, cancel_flow, exit_to_global_dispatcher, safety_preempt; false si un soutien local continue.",
    "- visible_task.kind: stage exact: hold_space_support -> hold_space; ask_support_preference -> ask_support_preference; offer_soft_next_step -> offer_soft_next_step; reactivate_gently -> reactivate_gently; cancel_flow -> exit_or_cancel; safety_preempt -> safety.",
    "- visible_task.instruction: consigne courte au visible agent, jamais message visible complet.",
    "- visible_task.conversation_context: seul contexte visible-safe. Inclure qu'il n'y avait pas d'action cachee si pertinent, user_words, besoin emotionnel, incertitudes, limites de ton et do_not_say. Pas de DB brute, micro_memory brute ni note_information brute.",
    "- note_information: null pour presence, soutien ou stop local. Obligatoire pour exit_to_global_dispatcher et safety_preempt. Remplis seulement les champs reels NoteInformation: source_flow_id, source_flow_presentation, source_flow_state_summary, handoff_reason, target_dispatcher, handoff_context_for_next_dispatcher, target_local_dispatcher_hint, user_words, structured_context, risk_score, no_chat_mutation. Mets no_hidden_action, user_message_summary, active_flow_summary, collected_state, unresolved_questions, confidence, evidence et recommended_next_focus dans structured_context si utiles, pas comme champs top-level inventes. La note est pour le dispatcher cible et ne doit jamais etre exposee brute au prompt visible.",
    "- evidence: indices semantiques reellement utilises: besoin d'ecoute, demande de point d'appui, refus de mission, demande de potion/carte/status, safety. Pas de pseudo-preuves.",
    "",
    "Transition Rules:",
    "- Continuation locale: hold_space_support, ask_support_preference, offer_soft_next_step, reactivate_gently, clarify_emotional_need ou repeat_presence_context.",
    "- Stop local sans handoff: presence_ack_close, negative_nudge_feedback ou cancel_flow; pas de global sur le meme tour.",
    "- Exit global: exit_to_global_dispatcher pour demande explicite de potion, carte, rappel, preference, status, aide produit ou nouveau sujet; note_information obligatoire; aucun message visible local.",
    "- Safety: safety_preempt avec note_information cible safety_crisis; global normal bloque.",
    "",
    "Decision Examples (non-visible, exactly two):",
    '{"example_id":"emotional_continue","flow_action":"hold_space_support","confidence":"high","risk_score":2,"local_assessment":{"emotional_load":"medium","support_need":"listen","user_wants_conversation":true,"action_readiness":"not_applicable","main_emotion_or_context":"journee lourde","soft_next_step_candidate":null,"reactivation_candidate":null},"state_updates":{"status":"active","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"hold_space","instruction":"Tenir un espace simple sans action.","conversation_context":{"flow_kind":"emotional_presence","user_words":["je veux juste que ca reste doux"],"known_values":{"support_need":"listen"},"missing_or_weak_values":[],"tone_constraints":["doux","pas de mission"],"do_not_say":["ne parle pas d action cachee"],"evidence_used":["besoin de douceur"]}},"note_information":null,"evidence":["demande de presence douce"]}',
    '{"example_id":"emotional_exit","flow_action":"exit_to_global_dispatcher","confidence":"high","risk_score":0,"local_assessment":{"emotional_load":"medium","support_need":"clarity","user_wants_conversation":true,"action_readiness":"not_applicable","main_emotion_or_context":"besoin de clarte","soft_next_step_candidate":null,"reactivation_candidate":null},"state_updates":{"status":"exit_to_global","turn_count_increment":1,"close_after_visible":true},"visible_task":{"kind":"exit_or_cancel","instruction":"","conversation_context":{"flow_kind":"emotional_presence","user_words":["je veux une potion de clarte"],"known_values":{"requested_capability":"select_state_potion.clarte"},"missing_or_weak_values":[],"tone_constraints":["no local visible message"],"do_not_say":["ne reponds pas au user"],"evidence_used":["demande explicite potion"]}},"note_information":{"source_flow_id":"post_morning_nudge.emotional_presence","source_flow_presentation":"Non-action emotional presence nudge followup.","source_flow_state_summary":"Presence nudge with no hidden target action.","handoff_reason":"explicit_user_request","target_dispatcher":"select_state_potion","handoff_context_for_next_dispatcher":"Le user demande une potion de clarte depuis un nudge de presence emotionnelle.","target_local_dispatcher_hint":"clarte","user_words":["je veux une potion de clarte"],"structured_context":{"user_message_summary":"demande potion clarte","active_flow_summary":"post morning emotional presence nudge","collected_state":{"no_hidden_action":true,"requested_potion_hint":"clarte"},"unresolved_questions":[],"confidence":"high","evidence":["demande explicite potion"],"recommended_next_focus":"select_state_potion"},"risk_score":0,"no_chat_mutation":{"db_write_committed":false,"potion_session_created":false,"scheduled_checkin_created":false,"recurring_reminder_created":false,"executable_confirmation_generated":false}},"evidence":["demande explicite de potion de clarte"]}',
    "Retourne uniquement le JSON.",
  ].join("\n");
}

export async function runPostMorningNudgeEmotionalPresenceDispatcher(
  input: PostMorningNudgeEmotionalPresenceDispatcherInput,
): Promise<PostMorningNudgeEmotionalPresenceDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "post_morning_nudge_emotional_presence_dispatcher",
    standard_dispatcher_input: {
      current_user_message: input.current_user_message,
      recent_messages: input.recent_messages,
      active_flow_state: input.active_state,
      note_information_inbound: input.note_information_inbound ?? null,
      db_context_pack: input.db_context_pack,
      micro_memory_context: input.micro_memory_context,
      platform_context: input.platform_context,
      risk_context: input.risk_context,
      available_inline_tools: input.available_inline_tools,
      parent_flow_context: input.parent_flow_context,
      timezone: input.timezone,
      channel: input.channel,
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
        conversation_context: "object",
      },
      note_information:
        "object when flow_action exits to another dispatcher or safety_preempt, otherwise null",
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
    "Tu utilises uniquement visible_task.conversation_context pour le contenu metier. Tu ne refais pas la decision du dispatcher.",
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
    conversation_context: input.decision.visible_task.conversation_context,
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

function handoffNoteFromActionOutput(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeActionDispatcherOutput;
}): PostMorningNudgeLocalHandoffNote {
  const noteInformation = args.output.note_information ??
    buildPostMorningTransitionNoteInformation({
      state: args.state,
      assessment: args.output.local_assessment,
      reason: args.output.flow_action === "safety_preempt"
        ? "safety"
        : "unknown",
      riskScore: args.output.risk_score,
    });
  return buildPostMorningLocalHandoffNote({
    state: args.state,
    assessment: args.output.local_assessment,
    noteInformation,
    fallbackUserSummary:
      "User message needs another dispatcher outside post morning nudge action followup.",
  });
}

export function reducePostMorningNudgeActionTurn(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeActionDispatcherOutput;
  nowIso?: string | null;
}): {
  nextState: PostMorningNudgeActiveState | null;
  handoffNote: PostMorningNudgeLocalHandoffNote | null;
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
      handoffNote: handoffNoteFromActionOutput({
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
      handoffNote: null,
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
    handoffNote: null,
    closeAfterVisible: false,
  };
}

function handoffNoteFromSuppressedActionOutput(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeSuppressedActionDispatcherOutput;
}): PostMorningNudgeLocalHandoffNote {
  const noteInformation = args.output.note_information ??
    buildPostMorningTransitionNoteInformation({
      state: args.state,
      assessment: args.output.local_assessment,
      reason: args.output.flow_action === "safety_preempt"
        ? "safety"
        : "unknown",
      riskScore: args.output.risk_score,
    });
  return buildPostMorningLocalHandoffNote({
    state: args.state,
    assessment: args.output.local_assessment,
    noteInformation,
    fallbackUserSummary:
      "User message needs another dispatcher outside post morning nudge suppressed action followup.",
    constraints: [
      "Do not treat this as post_morning_nudge continuation unless selected again.",
      "Remember that the source nudge intentionally suppressed an action instead of pushing it.",
    ],
  });
}

export function reducePostMorningNudgeSuppressedActionTurn(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeSuppressedActionDispatcherOutput;
  nowIso?: string | null;
}): {
  nextState: PostMorningNudgeActiveState | null;
  handoffNote: PostMorningNudgeLocalHandoffNote | null;
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
      handoffNote: handoffNoteFromSuppressedActionOutput({
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
      handoffNote: null,
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
    handoffNote: null,
    closeAfterVisible: false,
  };
}

function handoffNoteFromEmotionalPresenceOutput(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeEmotionalPresenceDispatcherOutput;
}): PostMorningNudgeLocalHandoffNote {
  const noteInformation = args.output.note_information ??
    buildPostMorningTransitionNoteInformation({
      state: args.state,
      assessment: args.output.local_assessment,
      reason: args.output.flow_action === "safety_preempt"
        ? "safety"
        : "unknown",
      riskScore: args.output.risk_score,
    });
  return buildPostMorningLocalHandoffNote({
    state: args.state,
    assessment: args.output.local_assessment,
    noteInformation,
    fallbackUserSummary:
      "User message needs another dispatcher outside post morning nudge emotional presence followup.",
    constraints: [
      "Do not treat this as post_morning_nudge continuation unless selected again.",
      "Remember that the source nudge had no hidden target action.",
    ],
  });
}

export function reducePostMorningNudgeEmotionalPresenceTurn(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeEmotionalPresenceDispatcherOutput;
  nowIso?: string | null;
}): {
  nextState: PostMorningNudgeActiveState | null;
  handoffNote: PostMorningNudgeLocalHandoffNote | null;
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
      handoffNote: handoffNoteFromEmotionalPresenceOutput({
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
      handoffNote: null,
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
    handoffNote: null,
    closeAfterVisible: false,
  };
}

export async function runPostMorningNudgeLocalRuntime(args: {
  tempMemory: unknown;
  userId?: string | null;
  userMessage?: string | null;
  history?: Array<{ role?: string; content?: string }> | null;
  requestId?: string | null;
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
  if (state.flow_kind === "action") {
    const recentMessages = (args.history ?? []).slice(-8).map((message) => ({
      role: message?.role === "assistant"
        ? "assistant" as const
        : "user" as const,
      content: cleanText(message?.content),
    })).filter((message) => message.content);
    const dbContextPack = buildPostMorningNudgeDbContextPack(state);
    const microMemoryContext = buildPostMorningNudgeMicroMemoryContext({
      state,
      recentMessages,
    });
    const actionDispatcher = args.actionDispatcher ??
      runPostMorningNudgeActionDispatcher;
    const actionOutput = await actionDispatcher({
      user_id: cleanText(args.userId) || "unknown",
      request_id: args.requestId ?? null,
      current_user_message: cleanText(args.userMessage),
      user_message: cleanText(args.userMessage),
      recent_messages: recentMessages,
      active_state: state,
      note_information_inbound: state.activation_note_information,
      db_context_pack: dbContextPack,
      micro_memory_context: microMemoryContext,
      platform_context: { channel: "unknown" },
      risk_context: { risk_score: 0 },
      available_inline_tools: ["product_help", "status_recap"],
      parent_flow_context: {},
      timezone: "unknown",
      channel: "unknown",
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
    if (reduced.handoffNote) {
      nextTempMemory[LAST_POST_MORNING_NUDGE_NOTE_INFORMATION_KEY] = {
        ...reduced.handoffNote,
        at: cleanText(args.nowIso) || new Date().toISOString(),
      };
    }
    const exitToGlobal = actionOutput.flow_action ===
      "exit_to_global_dispatcher";
    const safetyPreempt = actionOutput.flow_action === "safety_preempt";
    const transitionToAnotherDispatcher = exitToGlobal || safetyPreempt;
    const actionCategory = flowActionCategory({
      flowKind: "action",
      flowAction: actionOutput.flow_action,
      visibleKind: actionOutput.visible_task.kind,
    });
    if (transitionToAnotherDispatcher) {
      logPostMorningNoteTransition({
        requestId: args.requestId ?? null,
        note: reduced.handoffNote?.note_information ?? null,
        flowAction: actionOutput.flow_action,
      });
    }
    const visibleAgent = args.actionVisibleAgent ??
      runPostMorningNudgeActionVisiblePrompt;
    const visibleContent = transitionToAnotherDispatcher
      ? ""
      : await visibleAgent({
        user_id: cleanText(args.userId) || "unknown",
        request_id: args.requestId ?? null,
        state,
        decision: actionOutput,
      });
    if (!transitionToAnotherDispatcher && !cleanText(visibleContent)) {
      return null;
    }
    return {
      content: transitionToAnotherDispatcher ? "" : cleanText(visibleContent),
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "post_morning_nudge.action_dispatcher",
        skill_id: "post_morning_nudge",
        flow_kind: "action",
        status: safetyPreempt
          ? "safety"
          : exitToGlobal
          ? "exit_to_global"
          : reduced.nextState?.status ?? "closed",
        reason_code: safetyPreempt
          ? "post_morning_nudge_safety_preempt"
          : exitToGlobal
          ? "post_morning_nudge_local_exit_to_global_dispatcher"
          : "post_morning_nudge_action_local_dispatcher",
        "post_morning_nudge.action_dispatcher_called": true,
        flow_action: actionOutput.flow_action,
        flow_action_category: actionCategory,
        confidence: actionOutput.confidence,
        risk_score: actionOutput.risk_score,
        visible_task: actionOutput.visible_task,
        db_context_pack: dbContextPack,
        micro_memory_context: microMemoryContext,
        local_assessment: actionOutput.local_assessment,
        state_updates: actionOutput.state_updates,
        close_after_visible: reduced.closeAfterVisible,
        note_information: reduced.handoffNote?.note_information ?? null,
        local_handoff_note: reduced.handoffNote,
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
        ai_call_count: transitionToAnotherDispatcher ? 1 : 2,
        runtime_trace: [{
          component: "post_morning_nudge.action_dispatcher",
          event: actionOutput.flow_action,
          "post_morning_nudge.flow_kind": "action",
          flow_action: actionOutput.flow_action,
          flow_action_category: actionCategory,
          "visible_task.kind": actionOutput.visible_task.kind,
          "local_assessment.action_readiness": actionOutput.local_assessment
            .action_readiness,
          "local_assessment.motivation_need": actionOutput.local_assessment
            .motivation_need,
          "state_updates.status": actionOutput.state_updates.status,
          close_after_visible: reduced.closeAfterVisible,
          "global_dispatcher_skipped_due_post_morning_nudge": !exitToGlobal ||
            safetyPreempt,
          "exit_to_global_dispatcher": exitToGlobal,
          "safety_preempt": safetyPreempt,
          target_dispatcher: reduced.handoffNote?.note_information
            ?.target_dispatcher ?? null,
          handoff_reason: reduced.handoffNote?.reason ?? null,
          note_information: reduced.handoffNote?.note_information ?? null,
          has_note_information: Boolean(
            reduced.handoffNote?.note_information,
          ),
          activation_note_information_consumed: true,
          db_context_pack_loaded: true,
          micro_memory_items: microMemoryContext.items.length,
        }],
      },
    };
  }
  if (state.flow_kind === "suppressed_action") {
    const recentMessages = (args.history ?? []).slice(-8).map((message) => ({
      role: message?.role === "assistant"
        ? "assistant" as const
        : "user" as const,
      content: cleanText(message?.content),
    })).filter((message) => message.content);
    const dbContextPack = buildPostMorningNudgeDbContextPack(state);
    const microMemoryContext = buildPostMorningNudgeMicroMemoryContext({
      state,
      recentMessages,
    });
    const suppressedDispatcher = args.suppressedActionDispatcher ??
      runPostMorningNudgeSuppressedActionDispatcher;
    const suppressedOutput = await suppressedDispatcher({
      user_id: cleanText(args.userId) || "unknown",
      request_id: args.requestId ?? null,
      current_user_message: cleanText(args.userMessage),
      user_message: cleanText(args.userMessage),
      recent_messages: recentMessages,
      active_state: state,
      note_information_inbound: state.activation_note_information,
      db_context_pack: dbContextPack,
      micro_memory_context: microMemoryContext,
      platform_context: { channel: "unknown" },
      risk_context: { risk_score: 0 },
      available_inline_tools: ["product_help", "status_recap"],
      parent_flow_context: {},
      timezone: "unknown",
      channel: "unknown",
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
    if (reduced.handoffNote) {
      nextTempMemory[LAST_POST_MORNING_NUDGE_NOTE_INFORMATION_KEY] = {
        ...reduced.handoffNote,
        at: cleanText(args.nowIso) || new Date().toISOString(),
      };
    }
    const exitToGlobal = suppressedOutput.flow_action ===
      "exit_to_global_dispatcher";
    const safetyPreempt = suppressedOutput.flow_action === "safety_preempt";
    const transitionToAnotherDispatcher = exitToGlobal || safetyPreempt;
    const suppressedCategory = flowActionCategory({
      flowKind: "suppressed_action",
      flowAction: suppressedOutput.flow_action,
      visibleKind: suppressedOutput.visible_task.kind,
    });
    if (transitionToAnotherDispatcher) {
      logPostMorningNoteTransition({
        requestId: args.requestId ?? null,
        note: reduced.handoffNote?.note_information ?? null,
        flowAction: suppressedOutput.flow_action,
      });
    }
    const visibleAgent = args.suppressedActionVisibleAgent ??
      runPostMorningNudgeSuppressedActionVisiblePrompt;
    const visibleContent = transitionToAnotherDispatcher
      ? ""
      : await visibleAgent({
        user_id: cleanText(args.userId) || "unknown",
        request_id: args.requestId ?? null,
        state,
        decision: suppressedOutput,
      });
    if (!transitionToAnotherDispatcher && !cleanText(visibleContent)) {
      return null;
    }
    return {
      content: transitionToAnotherDispatcher ? "" : cleanText(visibleContent),
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "post_morning_nudge.suppressed_action_dispatcher",
        skill_id: "post_morning_nudge",
        flow_kind: "suppressed_action",
        status: safetyPreempt
          ? "safety"
          : exitToGlobal
          ? "exit_to_global"
          : reduced.nextState?.status ?? "closed",
        reason_code: safetyPreempt
          ? "post_morning_nudge_safety_preempt"
          : exitToGlobal
          ? "post_morning_nudge_local_exit_to_global_dispatcher"
          : "post_morning_nudge_suppressed_action_local_dispatcher",
        "post_morning_nudge.suppressed_action_dispatcher_called": true,
        flow_action: suppressedOutput.flow_action,
        flow_action_category: suppressedCategory,
        confidence: suppressedOutput.confidence,
        risk_score: suppressedOutput.risk_score,
        visible_task: suppressedOutput.visible_task,
        db_context_pack: dbContextPack,
        micro_memory_context: microMemoryContext,
        local_assessment: suppressedOutput.local_assessment,
        state_updates: suppressedOutput.state_updates,
        close_after_visible: reduced.closeAfterVisible,
        note_information: reduced.handoffNote?.note_information ?? null,
        local_handoff_note: reduced.handoffNote,
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
        ai_call_count: transitionToAnotherDispatcher ? 1 : 2,
        runtime_trace: [{
          component: "post_morning_nudge.suppressed_action_dispatcher",
          event: suppressedOutput.flow_action,
          "post_morning_nudge.flow_kind": "suppressed_action",
          flow_action: suppressedOutput.flow_action,
          flow_action_category: suppressedCategory,
          "visible_task.kind": suppressedOutput.visible_task.kind,
          "local_assessment.action_readiness": suppressedOutput
            .local_assessment.action_readiness,
          "local_assessment.suppression_still_valid": suppressedOutput
            .local_assessment.suppression_still_valid ?? true,
          "local_assessment.main_need": suppressedOutput.local_assessment
            .main_need ?? null,
          "state_updates.status": suppressedOutput.state_updates.status,
          close_after_visible: reduced.closeAfterVisible,
          "global_dispatcher_skipped_due_post_morning_nudge": !exitToGlobal ||
            safetyPreempt,
          "exit_to_global_dispatcher": exitToGlobal,
          "safety_preempt": safetyPreempt,
          target_dispatcher: reduced.handoffNote?.note_information
            ?.target_dispatcher ?? null,
          handoff_reason: reduced.handoffNote?.reason ?? null,
          note_information: reduced.handoffNote?.note_information ?? null,
          has_note_information: Boolean(
            reduced.handoffNote?.note_information,
          ),
          activation_note_information_consumed: true,
          db_context_pack_loaded: true,
          micro_memory_items: microMemoryContext.items.length,
        }],
      },
    };
  }
  if (state.flow_kind === "emotional_presence") {
    const recentMessages = (args.history ?? []).slice(-8).map((message) => ({
      role: message?.role === "assistant"
        ? "assistant" as const
        : "user" as const,
      content: cleanText(message?.content),
    })).filter((message) => message.content);
    const dbContextPack = buildPostMorningNudgeDbContextPack(state);
    const microMemoryContext = buildPostMorningNudgeMicroMemoryContext({
      state,
      recentMessages,
    });
    const emotionalDispatcher = args.emotionalPresenceDispatcher ??
      runPostMorningNudgeEmotionalPresenceDispatcher;
    const emotionalOutput = await emotionalDispatcher({
      user_id: cleanText(args.userId) || "unknown",
      request_id: args.requestId ?? null,
      current_user_message: cleanText(args.userMessage),
      user_message: cleanText(args.userMessage),
      recent_messages: recentMessages,
      active_state: state,
      note_information_inbound: state.activation_note_information,
      db_context_pack: dbContextPack,
      micro_memory_context: microMemoryContext,
      platform_context: { channel: "unknown" },
      risk_context: { risk_score: 0 },
      available_inline_tools: ["product_help", "status_recap"],
      parent_flow_context: {},
      timezone: "unknown",
      channel: "unknown",
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
    if (reduced.handoffNote) {
      nextTempMemory[LAST_POST_MORNING_NUDGE_NOTE_INFORMATION_KEY] = {
        ...reduced.handoffNote,
        at: cleanText(args.nowIso) || new Date().toISOString(),
      };
    }
    const exitToGlobal = emotionalOutput.flow_action ===
      "exit_to_global_dispatcher";
    const safetyPreempt = emotionalOutput.flow_action === "safety_preempt";
    const transitionToAnotherDispatcher = exitToGlobal || safetyPreempt;
    const emotionalCategory = flowActionCategory({
      flowKind: "emotional_presence",
      flowAction: emotionalOutput.flow_action,
      visibleKind: emotionalOutput.visible_task.kind,
    });
    if (transitionToAnotherDispatcher) {
      logPostMorningNoteTransition({
        requestId: args.requestId ?? null,
        note: reduced.handoffNote?.note_information ?? null,
        flowAction: emotionalOutput.flow_action,
      });
    }
    const visibleAgent = args.emotionalPresenceVisibleAgent ??
      runPostMorningNudgeEmotionalPresenceVisiblePrompt;
    const visibleContent = transitionToAnotherDispatcher
      ? ""
      : await visibleAgent({
        user_id: cleanText(args.userId) || "unknown",
        request_id: args.requestId ?? null,
        state,
        decision: emotionalOutput,
      });
    if (!transitionToAnotherDispatcher && !cleanText(visibleContent)) {
      return null;
    }
    return {
      content: transitionToAnotherDispatcher ? "" : cleanText(visibleContent),
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "post_morning_nudge.emotional_presence_dispatcher",
        skill_id: "post_morning_nudge",
        flow_kind: "emotional_presence",
        status: safetyPreempt
          ? "safety"
          : exitToGlobal
          ? "exit_to_global"
          : reduced.nextState?.status ?? "closed",
        reason_code: safetyPreempt
          ? "post_morning_nudge_safety_preempt"
          : exitToGlobal
          ? "post_morning_nudge_local_exit_to_global_dispatcher"
          : "post_morning_nudge_emotional_presence_local_dispatcher",
        "post_morning_nudge.emotional_presence_dispatcher_called": true,
        flow_action: emotionalOutput.flow_action,
        flow_action_category: emotionalCategory,
        confidence: emotionalOutput.confidence,
        risk_score: emotionalOutput.risk_score,
        visible_task: emotionalOutput.visible_task,
        db_context_pack: dbContextPack,
        micro_memory_context: microMemoryContext,
        local_assessment: emotionalOutput.local_assessment,
        state_updates: emotionalOutput.state_updates,
        close_after_visible: reduced.closeAfterVisible,
        note_information: reduced.handoffNote?.note_information ?? null,
        local_handoff_note: reduced.handoffNote,
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
        ai_call_count: transitionToAnotherDispatcher ? 1 : 2,
        runtime_trace: [{
          component: "post_morning_nudge.emotional_presence_dispatcher",
          event: emotionalOutput.flow_action,
          "post_morning_nudge.flow_kind": "emotional_presence",
          flow_action: emotionalOutput.flow_action,
          flow_action_category: emotionalCategory,
          "visible_task.kind": emotionalOutput.visible_task.kind,
          "local_assessment.emotional_load": emotionalOutput.local_assessment
            .emotional_load,
          "local_assessment.support_need": emotionalOutput.local_assessment
            .support_need ?? null,
          "local_assessment.action_readiness": emotionalOutput.local_assessment
            .action_readiness,
          "state_updates.status": emotionalOutput.state_updates.status,
          close_after_visible: reduced.closeAfterVisible,
          "global_dispatcher_skipped_due_post_morning_nudge": !exitToGlobal ||
            safetyPreempt,
          "exit_to_global_dispatcher": exitToGlobal,
          "safety_preempt": safetyPreempt,
          target_dispatcher: reduced.handoffNote?.note_information
            ?.target_dispatcher ?? null,
          handoff_reason: reduced.handoffNote?.reason ?? null,
          note_information: reduced.handoffNote?.note_information ?? null,
          has_note_information: Boolean(
            reduced.handoffNote?.note_information,
          ),
          activation_note_information_consumed: true,
          db_context_pack_loaded: true,
          micro_memory_items: microMemoryContext.items.length,
        }],
      },
    };
  }
  return null;
}

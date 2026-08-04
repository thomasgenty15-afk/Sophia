import {
  createNoteInformation,
  type NoteInformation,
} from "../sophia-brain/contracts/note_information.v1.ts";
import type {
  CoachingRecommendationSignalContext,
} from "../sophia-brain/contracts/turn_frame.v1.ts";

export type CoachingParentFlowId =
  | "daily_action_review_v1"
  | "weekly_adaptive_review_v1";

export type CoachingParentBridgeReason =
  | "stuck_action"
  | "forgetting"
  | "avoidance"
  | "risk_moment"
  | "plan_misaligned"
  | "feature_choice"
  | "general_support"
  | "unknown";

export type CoachingParentBridgeActionContext = {
  plan_item_id?: string | null;
  occurrence_id?: string | null;
  title?: string | null;
  plan_id?: string | null;
  plan_title?: string | null;
  status?: string | null;
  source_stage?: string | null;
};

export type CoachingParentBridgeInput = {
  source_flow_id: CoachingParentFlowId;
  user_words?: string[];
  user_intent_summary: string;
  bridge_reason: CoachingParentBridgeReason;
  parent_stage: string | null;
  parent_state_summary: string;
  action_context: CoachingParentBridgeActionContext | null;
  known_values: Record<string, unknown>;
  missing_or_weak_values: string[];
  return_focus: string;
  evidence: string[];
  confidence: "low" | "medium" | "high" | "critical";
  dispatcher_signal_context?: CoachingRecommendationSignalContext | null;
};

function cleanText(value: unknown, max = 600): string {
  return String(value ?? "").trim().slice(0, max);
}

function cleanStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = cleanText(item, 220);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parentLabel(flowId: CoachingParentFlowId): string {
  return flowId === "daily_action_review_v1"
    ? "daily action review"
    : "weekly adaptive review";
}

function bridgeReason(value: unknown): CoachingParentBridgeReason {
  const text = cleanText(value);
  return text === "stuck_action" || text === "forgetting" ||
      text === "avoidance" || text === "risk_moment" ||
      text === "plan_misaligned" || text === "feature_choice" ||
      text === "general_support" || text === "unknown"
    ? text
    : "unknown";
}

function bridgeConfidence(
  value: CoachingParentBridgeInput["confidence"],
): "low" | "medium" | "high" {
  return value === "critical" ? "high" : value;
}

export function compactParentActionContext(
  value: unknown,
): CoachingParentBridgeActionContext | null {
  if (!isRecord(value)) return null;
  const context: CoachingParentBridgeActionContext = {
    plan_item_id: cleanText(value.plan_item_id) || null,
    occurrence_id: cleanText(value.occurrence_id) || null,
    title: cleanText(value.title) || null,
    plan_id: cleanText(value.plan_id) || null,
    plan_title: cleanText(value.plan_title) || null,
    status: cleanText(value.status) || null,
    source_stage: cleanText(value.source_stage) || null,
  };
  return Object.values(context).some((item) => item !== null) ? context : null;
}

export function buildCoachingRecommendationBridgeNote(
  input: CoachingParentBridgeInput,
): NoteInformation {
  const userWords = cleanStringArray(input.user_words, 4);
  const summary = cleanText(input.user_intent_summary) ||
    userWords[0] ||
    "User needs help choosing a Sophia lever.";
  const parentStateSummary = cleanText(input.parent_state_summary) ||
    `${parentLabel(input.source_flow_id)} is active.`;
  const returnFocus = cleanText(input.return_focus) ||
    `resume_${input.source_flow_id}_after_coaching_recommendation`;
  const dispatcherSignalContext = isRecord(input.dispatcher_signal_context)
    ? input.dispatcher_signal_context
    : null;
  const structured_context = {
    bridge_kind: "parent_to_coaching_recommendation",
    source_flow_id: input.source_flow_id,
    parent_flow_id: input.source_flow_id,
    parent_stage: cleanText(input.parent_stage) || null,
    parent_state_summary: parentStateSummary,
    user_message_summary: summary,
    bridge_reason: bridgeReason(input.bridge_reason),
    action_context: input.action_context
      ? compactParentActionContext(input.action_context)
      : null,
    known_values: isRecord(input.known_values) ? input.known_values : {},
    missing_or_weak_values: cleanStringArray(
      input.missing_or_weak_values,
      12,
    ),
    return_target: input.source_flow_id,
    return_focus: returnFocus,
    recommended_next_focus: "coaching_recommendation",
    evidence: cleanStringArray(input.evidence, 8),
    dispatcher_signal_context: dispatcherSignalContext,
  };
  return createNoteInformation({
    source_flow_id: input.source_flow_id,
    handoff_reason: input.bridge_reason === "feature_choice"
      ? "explicit_user_request"
      : "flow_interruption",
    target_dispatcher: "coaching_recommendation",
    handoff_context_for_next_dispatcher: `${
      parentLabel(input.source_flow_id)
    } pauses for coaching recommendation: ${summary}`,
    user_words: userWords,
    structured_context,
    confidence: bridgeConfidence(input.confidence),
  });
}

export function isCoachingRecommendationBridgeNote(
  note: unknown,
): note is NoteInformation {
  if (!isRecord(note)) return false;
  if (note.target_dispatcher !== "coaching_recommendation") return false;
  const source = note.source_flow_id;
  if (
    source !== "daily_action_review_v1" &&
    source !== "weekly_adaptive_review_v1"
  ) return false;
  const context = isRecord(note.structured_context)
    ? note.structured_context
    : {};
  if (context.bridge_kind !== "parent_to_coaching_recommendation") {
    return false;
  }
  if (context.parent_flow_id !== source || context.return_target !== source) {
    return false;
  }
  if (context.recommended_next_focus !== "coaching_recommendation") {
    return false;
  }
  return true;
}

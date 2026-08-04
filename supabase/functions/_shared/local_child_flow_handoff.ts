import {
  buildCoachingRecommendationBridgeNote,
  type CoachingParentBridgeReason,
  compactParentActionContext,
} from "./coaching_parent_bridge.ts";
import type { NoteInformation } from "../sophia-brain/contracts/note_information.v1.ts";
import type {
  CoachingRecommendationSignalContext,
  ConfidenceBand,
  DispatcherSkillSignals,
  TurnFrame,
} from "../sophia-brain/contracts/turn_frame.v1.ts";
import type {
  DailyActionCoachingHandoffContext,
} from "../sophia-brain/skills/daily_action_coaching_recommendation/contract.ts";

export type LocalParentFlowId =
  | "daily_action_review_v1"
  | "weekly_adaptive_review_v1";

export type LocalChildFlowId =
  | "coaching_recommendation"
  | "daily_action_coaching_recommendation_v1";

export type LocalChildFlowReturnToParent = {
  parent_flow_id: LocalParentFlowId;
  return_focus:
    | "resume_daily_after_coaching_recommendation"
    | "resume_daily_after_action_coaching"
    | "resume_weekly_review_after_coaching_recommendation";
  preserve_parent_state: true;
};

export type CoachingRecommendationChildFlowHandoff = {
  flow_action: "handoff_to_child_flow";
  child_flow: "coaching_recommendation";
  return_to_parent: LocalChildFlowReturnToParent;
  child_flow_context: CoachingRecommendationSignalContext;
};

export type DailyActionCoachingChildFlowHandoff = {
  flow_action: "handoff_to_child_flow";
  child_flow: "daily_action_coaching_recommendation_v1";
  return_to_parent: LocalChildFlowReturnToParent & {
    parent_flow_id: "daily_action_review_v1";
    return_focus: "resume_daily_after_action_coaching";
  };
  child_flow_context: DailyActionCoachingHandoffContext;
};

export type LocalChildFlowHandoff =
  | CoachingRecommendationChildFlowHandoff
  | DailyActionCoachingChildFlowHandoff;

export type LocalChildFlowActivation = {
  handoff: LocalChildFlowHandoff;
  skill_signal: NonNullable<
    DispatcherSkillSignals["coaching_recommendation"]
  >;
  note_information: NoteInformation;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function confidenceBandFromScore(score: unknown): Exclude<
  ConfidenceBand,
  "critical"
> {
  const numeric = Number(score);
  if (Number.isFinite(numeric)) {
    if (numeric >= 0.8) return "high";
    if (numeric >= 0.55) return "medium";
    return "low";
  }
  return "medium";
}

export function isLocalChildFlowHandoff(
  value: unknown,
): value is LocalChildFlowHandoff {
  if (!isRecord(value)) return false;
  if (value.flow_action !== "handoff_to_child_flow") return false;
  if (
    value.child_flow !== "coaching_recommendation" &&
    value.child_flow !== "daily_action_coaching_recommendation_v1"
  ) return false;
  const returnToParent = value.return_to_parent;
  if (!isRecord(returnToParent)) return false;
  const parent = returnToParent.parent_flow_id;
  if (
    parent !== "daily_action_review_v1" &&
    parent !== "weekly_adaptive_review_v1"
  ) return false;
  if (returnToParent.preserve_parent_state !== true) return false;
  if (!isRecord(value.child_flow_context)) return false;
  if (value.child_flow === "daily_action_coaching_recommendation_v1") {
    return parent === "daily_action_review_v1" &&
      returnToParent.return_focus === "resume_daily_after_action_coaching";
  }
  return true;
}

export function buildCoachingRecommendationSkillSignal(
  context: CoachingRecommendationSignalContext,
): NonNullable<DispatcherSkillSignals["coaching_recommendation"]> {
  const confidenceBand = confidenceBandFromScore(context.confidence);
  return {
    detected: true,
    confidence_band: confidenceBand,
    reason: cleanText(context.reason) || "parent_child_flow_handoff",
    context,
  };
}

export function turnFrameWithChildFlowHandoff(
  turnFrame: TurnFrame,
  activation: LocalChildFlowActivation,
): TurnFrame {
  return {
    ...turnFrame,
    note_information: activation.note_information,
    skill_signals: {
      ...(turnFrame.skill_signals ?? {}),
      coaching_recommendation: activation.skill_signal,
    },
  };
}

export function buildCoachingChildFlowActivation(params: {
  handoff: CoachingRecommendationChildFlowHandoff;
  bridgeReason: CoachingParentBridgeReason;
  parentStage: string | null;
  parentStateSummary: string;
  knownValues?: Record<string, unknown>;
  missingOrWeakValues?: string[];
  evidence?: string[];
}): LocalChildFlowActivation {
  const signal = buildCoachingRecommendationSkillSignal(
    params.handoff.child_flow_context,
  );
  const context = params.handoff.child_flow_context;
  const actionContext = context.action_context
    ? compactParentActionContext({
      plan_item_id: context.action_context.plan_item_id ?? null,
      title: context.action_context.action_title ?? null,
      source_stage: params.parentStage,
    })
    : null;
  const note = buildCoachingRecommendationBridgeNote({
    source_flow_id: params.handoff.return_to_parent.parent_flow_id,
    user_intent_summary: context.reason,
    bridge_reason: params.bridgeReason,
    parent_stage: params.parentStage,
    parent_state_summary: params.parentStateSummary,
    action_context: actionContext,
    known_values: params.knownValues ?? {},
    missing_or_weak_values: params.missingOrWeakValues ?? [],
    return_focus: params.handoff.return_to_parent.return_focus,
    evidence: params.evidence ?? [],
    confidence: signal.confidence_band,
    dispatcher_signal_context: context,
  });
  return {
    handoff: params.handoff,
    skill_signal: signal,
    note_information: note,
  };
}

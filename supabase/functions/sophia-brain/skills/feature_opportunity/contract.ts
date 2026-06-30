import type { NoteInformation } from "../../contracts/note_information.v1.ts";
import type { LocalOneShotDirectEffectRequest } from "../../router/one_shot_local_direct_effect.ts";
import type {
  FeatureOpportunityKind,
  FeatureOpportunitySignalContext,
} from "../../contracts/turn_frame.v1.ts";

export type { FeatureOpportunityKind };

export type FeatureOpportunityFlowAction =
  | "recommend_feature"
  | "clarify_opportunity"
  | "answer_followup"
  | "close_flow"
  | "exit_to_global_dispatcher";

export type FeatureOpportunityVisibleTaskKind =
  | "recommend_feature"
  | "ask_opportunity_clarification"
  | "answer_followup"
  | "close_opportunity"
  | "exit_ack";

export type FeatureOpportunityLocalState = {
  feature: FeatureOpportunityKind | null;
  opportunity_kind: string | null;
  user_problem_summary: string | null;
  trigger_context: string | null;
  dispatcher_signal_context: FeatureOpportunitySignalContext | null;
  turn_count: number;
  max_turns: number;
};

export type FeatureOpportunityConversationContext = {
  feature: FeatureOpportunityKind | null;
  user_problem_summary: string | null;
  trigger_context: string | null;
  known_values: Record<string, unknown>;
  direct_effect_confirmation_context?: Record<string, unknown> | null;
  missing_or_weak_values: string[];
  recommendation: {
    feature: FeatureOpportunityKind | null;
    why: string | null;
    user_facing_next_step: string | null;
  };
  evidence_used: string[];
  tone_constraints: string[];
  do_not_say: string[];
};

export type FeatureOpportunityLocalDispatcherOutput = {
  flow_action: FeatureOpportunityFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  feature: FeatureOpportunityKind | null;
  opportunity_kind: string | null;
  user_problem_summary: string | null;
  trigger_context: string | null;
  recommendation: {
    feature: FeatureOpportunityKind | null;
    why: string | null;
    user_facing_next_step: string | null;
  };
  direct_effect_request: LocalOneShotDirectEffectRequest;
  state_updates: {
    status: "active" | "closing" | "closed" | "exit_to_global";
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: FeatureOpportunityVisibleTaskKind;
    instruction: string;
    conversation_context: FeatureOpportunityConversationContext;
  };
  note_information: NoteInformation | null;
  evidence: string[];
};

export type FeatureOpportunityReducerResult = {
  status: "continue" | "complete" | "exit";
  reason_code: string;
  local_state: FeatureOpportunityLocalState | null;
  visible_task: FeatureOpportunityVisibleTaskKind;
  conversation_context: FeatureOpportunityConversationContext;
  note_information: NoteInformation | null;
  effects: {
    requested: [];
    allowed: [];
    blocked: Array<{ type: string; reason_code: string }>;
    committed: [];
  };
};

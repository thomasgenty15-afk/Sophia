import type { NoteInformation } from "../../contracts/note_information.v1.ts";
import type { LocalOneShotDirectEffectRequest } from "../../router/one_shot_local_direct_effect.ts";
import type {
  PlanRealignmentDriftType,
  PlanRealignmentScope,
  PlanRealignmentSignalContext,
} from "../../contracts/turn_frame.v1.ts";

export type { PlanRealignmentDriftType, PlanRealignmentScope };

export type PlanRealignmentFlowAction =
  | "support"
  | "platform_guidance"
  | "answer_followup"
  | "close_flow"
  | "exit_to_global_dispatcher";

export type PlanRealignmentVisibleTaskKind =
  | "plan_realignment_support"
  | "plan_realignment_platform_guidance"
  | "plan_realignment_followup"
  | "plan_realignment_close"
  | "exit_ack";

export type PlanRealignmentLocalState = {
  drift_type: PlanRealignmentDriftType;
  scope: PlanRealignmentScope;
  explicit_adjust_request: boolean;
  product_execution_allowed: false;
  user_need_summary: string | null;
  dispatcher_signal_context: PlanRealignmentSignalContext | null;
  turn_count: number;
  max_turns: number;
  last_visible_task_kind: PlanRealignmentVisibleTaskKind | null;
  last_answer_summary: string | null;
};

export type PlanRealignmentConversationContext = {
  drift_type: PlanRealignmentDriftType;
  scope: PlanRealignmentScope;
  explicit_adjust_request: boolean;
  product_execution_allowed: false;
  user_need_summary: string | null;
  recommended_surface: "Dashboard > Plan";
  next_step: string | null;
  known_values: Record<string, unknown>;
  direct_effect_confirmation_context?: Record<string, unknown> | null;
  missing_or_weak_values: string[];
  evidence_used: string[];
  tone_constraints: string[];
  do_not_say: string[];
};

export type PlanRealignmentLocalDispatcherOutput = {
  flow_action: PlanRealignmentFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  drift_type: PlanRealignmentDriftType;
  scope: PlanRealignmentScope;
  explicit_adjust_request: boolean;
  user_need_summary: string | null;
  next_step: string | null;
  direct_effect_request: LocalOneShotDirectEffectRequest;
  state_updates: {
    status: "active" | "closing" | "closed" | "exit_to_global";
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: PlanRealignmentVisibleTaskKind;
    instruction: string;
    conversation_context: PlanRealignmentConversationContext;
  };
  note_information: NoteInformation | null;
  evidence: string[];
};

export type PlanRealignmentReducerResult = {
  status: "continue" | "complete" | "exit";
  reason_code: string;
  local_state: PlanRealignmentLocalState | null;
  visible_task: PlanRealignmentVisibleTaskKind;
  conversation_context: PlanRealignmentConversationContext;
  note_information: NoteInformation | null;
  effects: {
    requested: [];
    allowed: [];
    blocked: Array<{ type: string; reason_code: string }>;
    committed: [];
  };
};

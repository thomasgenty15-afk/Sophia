import type { NoteInformation } from "../../contracts/note_information.v1.ts";
import type {
  CoachingFeatureSuggestion,
  CoachingRecommendationDecision,
  CoachingVisibleDecision,
} from "../coaching_recommendation/contract.ts";

export const DAILY_ACTION_COACHING_SKILL_ID =
  "daily_action_coaching_recommendation_v1" as const;

export type DailyActionCoachingFeature = Exclude<
  CoachingFeatureSuggestion,
  "state_potion"
>;

export type DailyActionCoachingActionContext = {
  occurrence_id: string;
  plan_item_id: string;
  plan_id: string | null;
  title: string;
  description: string | null;
  action_type: "habit" | "mission" | "clarification" | "other" | null;
  outcome: "completed" | "missed" | null;
  reason_category: string | null;
  reason_text: string | null;
};

export type DailyActionCoachingHandoffContext = {
  source_flow_id: "daily_action_review_v1";
  parent_flow_id: "daily_action_review_v1";
  return_focus: "resume_daily_after_action_coaching";
  action_context: DailyActionCoachingActionContext;
  help_request_summary: string;
  affect_context?: Record<string, unknown> | null;
  confidence?: number;
};

export type DailyActionCoachingLocalState = DailyActionCoachingHandoffContext & {
  turn_count: number;
  last_recommendation: CoachingRecommendationDecision | null;
};

export type DailyActionCoachingFlowAction =
  | "recommend_and_return"
  | "clarify_help_need"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type DailyActionCoachingDispatcherOutput = {
  flow_action: DailyActionCoachingFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score?: number;
  recommendation: {
    primary_feature: DailyActionCoachingFeature | null;
    secondary_feature?: DailyActionCoachingFeature | null;
    why_primary: string | null;
    user_facing_next_step?: string | null;
  };
  visible_task: {
    kind: "action_plan_coaching" | "clarify_help_need" | "safety";
    instruction?: string | null;
  };
  note_information?: NoteInformation | null;
  evidence?: string[];
};

export type DailyActionCoachingVisibleOutput = {
  message: string;
  visible_decision: CoachingVisibleDecision | null;
};

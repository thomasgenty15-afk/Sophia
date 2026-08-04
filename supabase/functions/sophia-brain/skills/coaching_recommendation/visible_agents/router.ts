import { runActionPlanCoachingVisibleAgent } from "./action_plan_coaching.ts";
import { runChangeConfirmCoachingTypeVisibleAgent } from "./change_confirm_coaching_type.ts";
import { runCloseOrFollowupVisibleAgent } from "./close_or_followup.ts";
import { runEmotionCoachingVisibleAgent } from "./emotion_coaching.ts";
import { runNoPlanCoachingVisibleAgent } from "./no_plan_coaching.ts";
import type {
  CoachingRecommendationVisibleAgent,
  CoachingVisibleAgentOutput,
  CoachingVisibleAgentInput,
} from "./shared.ts";

export type {
  CoachingRecommendationVisibleAgent,
  CoachingVisibleAgentOutput,
  CoachingVisibleAgentInput,
} from "./shared.ts";

export async function runCoachingRecommendationVisibleAgent(
  input: CoachingVisibleAgentInput,
): Promise<CoachingVisibleAgentOutput | string | null> {
  switch (input.step_context.task_kind) {
    case "change_confirm_coaching_type":
      return runChangeConfirmCoachingTypeVisibleAgent(input);
    case "emotion_coaching":
      return runEmotionCoachingVisibleAgent(input);
    case "no_plan_coaching":
      return runNoPlanCoachingVisibleAgent(input);
    case "action_plan_coaching":
      return runActionPlanCoachingVisibleAgent(input);
    case "ask_difficulty_clarification":
    case "explain_cause":
    case "recommend_feature":
    case "explain_platform_destination":
      return runNoPlanCoachingVisibleAgent(input);
    case "answer_followup":
    case "close_recommendation":
      return runCloseOrFollowupVisibleAgent(input);
    case "exit_ack":
      return runCloseOrFollowupVisibleAgent(input);
  }
}

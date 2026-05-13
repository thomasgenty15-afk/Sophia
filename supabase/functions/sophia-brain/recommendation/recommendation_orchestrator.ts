import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import type { ProductRecommendation } from "./recommendation_types.ts";

export type RecommendationOrchestratorDecision = {
  decision: "present_now" | "defer" | "drop";
  presentation_payload?: {
    recommendation_id: string;
    surface_id?: string | null;
    operation_type?: string | null;
    level: number;
    cta_style: string;
    offer?: string | null;
    requires_consent: boolean;
  };
  reason_code: string;
};

export async function runRecommendationOrchestrator(input: {
  recommendation: ProductRecommendation;
  current_skill_output?: ConversationSkillOutput;
  presentation_state?: any;
}): Promise<RecommendationOrchestratorDecision> {
  const recommendation = input.recommendation;
  if (recommendation.decision === "blocked") {
    return { decision: "drop", reason_code: "recommendation_blocked" };
  }
  if (recommendation.decision === "defer") {
    return { decision: "defer", reason_code: "recommendation_deferred" };
  }
  if (recommendation.decision === "ask_clarification") {
    return { decision: "defer", reason_code: "clarification_before_present" };
  }
  if (
    input.current_skill_output?.skill_id === "safety_crisis" ||
    input.current_skill_output?.recommendation_need?.urgency === "high"
  ) {
    return { decision: "drop", reason_code: "safety_or_high_emotion" };
  }
  const surfaceId = recommendation.surface_id ??
    recommendation.operation_type ??
    "";
  const cooldowns = input.presentation_state?.cooldowns ?? {};
  if (surfaceId && cooldowns[surfaceId]) {
    return { decision: "defer", reason_code: "cooldown_active" };
  }
  const recentDeclines =
    Array.isArray(input.presentation_state?.recent_declines)
      ? input.presentation_state.recent_declines
      : [];
  if (surfaceId && recentDeclines.includes(surfaceId)) {
    return { decision: "drop", reason_code: "recent_decline" };
  }
  const existingLevel = Number(
    input.presentation_state?.current_presentation_level ?? -1,
  );
  if (recommendation.presentation_level <= existingLevel) {
    return { decision: "drop", reason_code: "presentation_level_not_higher" };
  }
  if (recommendation.presentation_level <= 0) {
    return { decision: "drop", reason_code: "zero_presentation_level" };
  }
  return {
    decision: "present_now",
    reason_code: "presentable",
    presentation_payload: {
      recommendation_id: recommendation.recommendation_id,
      surface_id: recommendation.surface_id,
      operation_type: recommendation.operation_type,
      level: recommendation.presentation_level,
      cta_style: recommendation.cta_style,
      offer: recommendation.user_facing_offer,
      requires_consent: recommendation.requires_consent,
    },
  };
}

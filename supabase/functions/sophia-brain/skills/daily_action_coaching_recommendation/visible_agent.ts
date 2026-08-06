import {
  runActionPlanCoachingVisibleAgent,
} from "../coaching_recommendation/visible_agents/action_plan_coaching.ts";
import type {
  CoachingVisibleAgentInput,
  CoachingVisibleAgentOutput,
} from "../coaching_recommendation/visible_agents/router.ts";
import type {
  ActionPlanCoachingStepContext,
  CoachingCauseAnalysis,
  CoachingDifficulty,
  CoachingFeatureProductGuidance,
  CoachingRecommendationDecision,
  CoachingRecommendationFlowContext,
} from "../coaching_recommendation/contract.ts";
import type {
  DailyActionCoachingActionContext,
  DailyActionCoachingFeature,
} from "./contract.ts";

function productGuidance(
  feature: DailyActionCoachingFeature,
): CoachingFeatureProductGuidance {
  if (feature === "adjust_plan") {
    return {
      feature,
      catalog_feature_id: "adjust_plan",
      label: "Ajustement du plan",
      explain:
        "Adapter une action du plan quand elle est trop lourde ou mal calibree.",
      how_to: "Ouvrir l'action concernee dans le Plan puis ajuster son format.",
      locations: [{
        surface: "Dashboard > Plan",
        when_visible: "Sur une action du plan",
        user_can_do: ["Ajuster l'action", "Adapter le rythme"],
      }],
      limits: ["Sophia ne modifie pas le plan depuis le chat."],
      sophia_must_not_claim: ["plan ajuste", "action modifiee"],
    };
  }
  return {
    feature,
    catalog_feature_id: feature,
    label: feature === "attack_card" ? "Carte d'attaque" : "Carte de defense",
    explain: feature === "attack_card"
      ? "Aider a demarrer une action du plan."
      : "Proteger un moment de risque autour d'une action du plan.",
    how_to: "Ouvrir l'action concernee dans le Plan puis preparer la carte.",
    locations: [{
      surface: "Dashboard > Plan",
      when_visible: "Sur une action du plan",
      user_can_do: ["Preparer une carte liee a l'action"],
    }],
    limits: ["Sophia ne cree pas la carte depuis le chat."],
    sophia_must_not_claim: ["carte creee", "carte preparee"],
  };
}

function flowContext(args: {
  action: DailyActionCoachingActionContext;
  recommendation: CoachingRecommendationDecision;
  evidence: string[];
}): CoachingRecommendationFlowContext {
  const difficulty: CoachingDifficulty = {
    target_kind: "plan_action",
    summary: args.action.reason_text,
    action_title: args.action.title,
    action_source: "plan",
  };
  const cause: CoachingCauseAnalysis = {
    primary_cause: args.action.reason_category === "forgot"
      ? "forgetting"
      : args.action.reason_category === "too_hard"
      ? "too_hard"
      : args.action.reason_category === "emotional"
      ? "emotional_overload"
      : "unclear",
    why_it_exists: args.action.reason_text,
    confidence: args.action.reason_text ? "medium" : "low",
    missing_info: [],
  };
  return {
    coaching_type: "plan_action",
    candidate_coaching_type: null,
    coaching_type_reason: "Daily action coaching is always plan-action scoped.",
    parent_flow_id: "daily_action_review_v1",
    parent_return_focus: "resume_daily_after_action_coaching",
    parent_action_context: args.action,
    parent_state_summary: "Daily action review paused for action coaching.",
    dispatcher_signal_context: null,
    product_guidance: {
      attack_card: productGuidance("attack_card"),
      defense_card: productGuidance("defense_card"),
      adjust_plan: productGuidance("adjust_plan"),
    },
    difficulty,
    cause_analysis: cause,
    recommendation: args.recommendation,
    evidence_used: args.evidence,
    missing_or_weak_values: [],
    tone_constraints: ["short", "action_plan_only"],
    do_not_say: [
      "ne parle pas de potion",
      "ne parle pas d'action hors plan",
      "ne promets pas de creation ou modification",
    ],
  };
}

function stepContext(args: {
  action: DailyActionCoachingActionContext;
  recommendation: CoachingRecommendationDecision;
}): ActionPlanCoachingStepContext {
  return {
    task_kind: "action_plan_coaching",
    objective:
      "Recommander le levier Sophia le plus utile pour cette action daily du plan, puis laisser le parent daily reprendre.",
    plan_item_id: args.action.plan_item_id,
    action_title: args.action.title,
    selected_feature: args.recommendation.primary_feature as
      | DailyActionCoachingFeature
      | null,
    secondary_feature: args.recommendation.secondary_feature as
      | DailyActionCoachingFeature
      | null,
    why_selected: args.recommendation.why_primary,
    platform_destination: args.recommendation.platform_destination,
    product_guidance: {
      attack_card: productGuidance("attack_card"),
      defense_card: productGuidance("defense_card"),
      adjust_plan: productGuidance("adjust_plan"),
    },
  };
}

export async function runDailyActionCoachingVisibleAgent(args: {
  user_id: string;
  /** W9/R3 — résolue par le runtime, descendue par le skill. Jamais devinée. */
  response_locale: string;
  request_id?: string | null;
  recent_messages: Array<{
    role: "user" | "assistant";
    content: string;
    created_at?: string | null;
  }>;
  recent_effects_summary?: string | null;
  user_identity?: {
    first_name: string | null;
    age: number | null;
    gender: "male" | "female" | "other" | null;
  } | null;
  action: DailyActionCoachingActionContext;
  recommendation: CoachingRecommendationDecision;
  evidence: string[];
}): Promise<CoachingVisibleAgentOutput | null> {
  const input: CoachingVisibleAgentInput = {
    user_id: args.user_id,
    response_locale: args.response_locale,
    request_id: args.request_id,
    visible_runtime_context: {
      recent_messages: args.recent_messages.slice(-8),
      recent_effects_summary: args.recent_effects_summary ?? null,
      user_identity: args.user_identity ?? null,
    },
    flow_context: flowContext({
      action: args.action,
      recommendation: args.recommendation,
      evidence: args.evidence,
    }),
    step_context: stepContext({
      action: args.action,
      recommendation: args.recommendation,
    }),
  };
  return await runActionPlanCoachingVisibleAgent(input);
}

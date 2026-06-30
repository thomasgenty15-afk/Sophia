import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";

type FlowInterventionContext = {
  last_flow_target?: string | null;
  turns_since_last_flow_exit?: number | null;
};

function safetyBlocksGlobalRoute(riskBand: RiskBand): boolean {
  return riskBand === "high" || riskBand === "critical";
}

function buildRouteDecision(args: {
  response_owner: RouteDecision["response_owner"];
  reason_code: string;
  selected_handler?: string;
  blocked_paths?: RouteDecision["blocked_paths"];
  direct_effects_to_run?: string[];
  active_owner?: string;
  arbitration_decision?: string;
  resume_policy?: string;
}): RouteDecision {
  const decision: RouteDecision = {
    route_version: "v1",
    response_owner: args.response_owner,
    blocked_paths: args.blocked_paths ?? [],
    direct_effects_to_run: args.direct_effects_to_run ?? [],
    reason_code: args.reason_code,
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  };
  if (args.arbitration_decision || args.active_owner || args.resume_policy) {
    decision.active_flow_arbitration = {
      decision: args.arbitration_decision ?? "global_route_default",
      active_owner: args.active_owner ?? "none",
      selected_owner: args.response_owner,
      resume_policy: args.resume_policy ?? "none",
      reason_code: args.reason_code,
    };
  }
  if (args.selected_handler !== undefined) {
    decision.selected_handler = args.selected_handler;
  }
  return decision;
}

function runnableDirectEffects(turnFrame: TurnFrame): string[] {
  return turnFrame.direct_effects
    .filter((effect) =>
      (effect.effect_type === "create_one_shot_reminder" ||
        effect.effect_type === "track_progress_plan_item") &&
      effect.explicitness === "explicit" &&
      effect.target_status === "identified" &&
      (effect.confidence_band === "high" ||
        effect.confidence_band === "critical")
    )
    .map((effect) => effect.effect_type);
}

function blockedDirectEffects(
  turnFrame: TurnFrame,
): RouteDecision["blocked_paths"] {
  return turnFrame.direct_effects
    .filter((effect) =>
      effect.target_status !== "identified" ||
      effect.explicitness !== "explicit" ||
      effect.confidence_band === "low" ||
      effect.confidence_band === "medium"
    )
    .map((effect) => ({
      path: `direct_effects.${effect.effect_type}`,
      reason_code: effect.target_status === "identified"
        ? "direct_effect_not_strong_enough"
        : effect.target_status === "ambiguous"
        ? "target_ambiguous"
        : "target_missing",
    }));
}

function productHelpDetected(turnFrame: TurnFrame): boolean {
  return turnFrame.skill_signals.product_help?.detected === true &&
    turnFrame.skill_signals.product_help.confidence_band !== "low";
}

function coachingRecommendationDetected(turnFrame: TurnFrame): boolean {
  return turnFrame.skill_signals.coaching_recommendation?.detected === true &&
    turnFrame.skill_signals.coaching_recommendation.confidence_band !== "low";
}

function featureOpportunityDetected(turnFrame: TurnFrame): boolean {
  return turnFrame.skill_signals.feature_opportunity?.detected === true &&
    turnFrame.skill_signals.feature_opportunity.confidence_band !== "low";
}

function activeConversationSkillId(activeSkillState: unknown): string {
  const record = activeSkillState && typeof activeSkillState === "object" &&
      !Array.isArray(activeSkillState)
    ? activeSkillState as Record<string, unknown>
    : {};
  return String(record.skill_id ?? "").trim();
}

function isActiveConversationSkill(
  activeSkillState: unknown,
  skillId:
    | "safety_crisis"
    | "product_help"
    | "coaching_recommendation"
    | "daily_action_coaching_recommendation_v1"
    | "feature_opportunity"
    | "weekly_adaptive_review_v1",
): boolean {
  const record = activeSkillState && typeof activeSkillState === "object" &&
      !Array.isArray(activeSkillState)
    ? activeSkillState as Record<string, unknown>
    : {};
  return activeConversationSkillId(activeSkillState) === skillId &&
    String(record.status ?? "active").trim() !== "closed";
}

export function runConversationRouters(input: {
  turn_frame: TurnFrame;
  active_skill_state?: unknown;
  flow_intervention_context?: FlowInterventionContext;
  safety_context_risk_band: RiskBand;
}): RouteDecision {
  void input.flow_intervention_context;

  const riskBand = input.turn_frame.safety.risk_band;
  const directEffectsToRun = runnableDirectEffects(input.turn_frame);
  const blockedPaths = blockedDirectEffects(input.turn_frame);
  if (
    safetyBlocksGlobalRoute(riskBand) ||
    safetyBlocksGlobalRoute(input.safety_context_risk_band)
  ) {
    const safetyAllowedDirectEffects = directEffectsToRun.filter((effect) =>
      effect === "create_one_shot_reminder"
    );
    return buildRouteDecision({
      response_owner: "safety",
      selected_handler: "safety_crisis",
      direct_effects_to_run: safetyAllowedDirectEffects,
      reason_code: "safety_high_critical_priority",
      blocked_paths: [
        ...blockedPaths,
        ...directEffectsToRun
          .filter((effect) => effect !== "create_one_shot_reminder")
          .map((effect) => ({
            path: `direct_effects.${effect}`,
            reason_code: "safety_priority",
          })),
        { path: "product_help", reason_code: "safety_priority" },
        {
          path: "coaching_recommendation",
          reason_code: "safety_priority",
        },
        {
          path: "feature_opportunity",
          reason_code: "safety_priority",
        },
        { path: "normal_reply", reason_code: "safety_priority" },
      ],
    });
  }

  if (
    isActiveConversationSkill(input.active_skill_state, "safety_crisis")
  ) {
    const safetyAllowedDirectEffects = directEffectsToRun.filter((effect) =>
      effect === "create_one_shot_reminder"
    );
    return buildRouteDecision({
      response_owner: "safety",
      selected_handler: "safety_crisis",
      direct_effects_to_run: safetyAllowedDirectEffects,
      blocked_paths: [
        ...blockedPaths,
        ...directEffectsToRun
          .filter((effect) => effect !== "create_one_shot_reminder")
          .map((effect) => ({
            path: `direct_effects.${effect}`,
            reason_code: "active_safety_priority",
          })),
        { path: "product_help", reason_code: "active_safety_priority" },
        {
          path: "coaching_recommendation",
          reason_code: "active_safety_priority",
        },
        {
          path: "feature_opportunity",
          reason_code: "active_safety_priority",
        },
        { path: "normal_reply", reason_code: "active_safety_priority" },
      ],
      active_owner: "safety_crisis",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: safetyAllowedDirectEffects.length > 0
        ? "active_safety_crisis_with_direct_effects"
        : "active_safety_crisis",
    });
  }

  if (
    isActiveConversationSkill(input.active_skill_state, "product_help")
  ) {
    return buildRouteDecision({
      response_owner: "product_help",
      selected_handler: "product_help",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "product_help",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_product_help_with_direct_effects"
        : "active_product_help",
    });
  }

  if (
    isActiveConversationSkill(
      input.active_skill_state,
      "weekly_adaptive_review_v1",
    )
  ) {
    return buildRouteDecision({
      response_owner: "weekly_adaptive_review_v1",
      selected_handler: "weekly_adaptive_review_v1",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "weekly_adaptive_review_v1",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_weekly_adaptive_review_with_direct_effects"
        : "active_weekly_adaptive_review",
    });
  }

  if (
    isActiveConversationSkill(
      input.active_skill_state,
      "daily_action_coaching_recommendation_v1",
    )
  ) {
    return buildRouteDecision({
      response_owner: "daily_action_coaching_recommendation_v1",
      selected_handler: "daily_action_coaching_recommendation_v1",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "daily_action_coaching_recommendation_v1",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_daily_action_coaching_recommendation_with_direct_effects"
        : "active_daily_action_coaching_recommendation",
    });
  }

  if (
    isActiveConversationSkill(
      input.active_skill_state,
      "coaching_recommendation",
    )
  ) {
    return buildRouteDecision({
      response_owner: "coaching_recommendation",
      selected_handler: "coaching_recommendation",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "coaching_recommendation",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_coaching_recommendation_with_direct_effects"
        : "active_coaching_recommendation",
    });
  }

  if (
    isActiveConversationSkill(input.active_skill_state, "feature_opportunity")
  ) {
    return buildRouteDecision({
      response_owner: "feature_opportunity",
      selected_handler: "feature_opportunity",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "feature_opportunity",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_feature_opportunity_with_direct_effects"
        : "active_feature_opportunity",
    });
  }

  if (productHelpDetected(input.turn_frame)) {
    return buildRouteDecision({
      response_owner: "product_help",
      selected_handler: "product_help",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      reason_code: directEffectsToRun.length > 0
        ? "product_help_with_direct_effects"
        : "product_help_signal",
    });
  }

  if (coachingRecommendationDetected(input.turn_frame)) {
    return buildRouteDecision({
      response_owner: "coaching_recommendation",
      selected_handler: "coaching_recommendation",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      reason_code: "coaching_recommendation_signal",
    });
  }

  if (featureOpportunityDetected(input.turn_frame)) {
    return buildRouteDecision({
      response_owner: "feature_opportunity",
      selected_handler: "feature_opportunity",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      reason_code: "feature_opportunity_signal",
    });
  }

  return buildRouteDecision({
    response_owner: "normal_reply",
    direct_effects_to_run: directEffectsToRun,
    blocked_paths: blockedPaths,
    reason_code: directEffectsToRun.length > 0
      ? "direct_effects_then_normal_reply"
      : "normal_reply_default",
  });
}

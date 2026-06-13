import type {
  ResponseOwner,
  RouteDecision,
} from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runActiveFlowArbitrator } from "./active_flow_arbitrator.ts";
import {
  demotivationRepairOwnsAfterActionRefusal,
  type FlowInterventionContext,
  runInterventionPolicy,
} from "./intervention_policy.ts";
import { runSkillRouter } from "./skill_router.ts";
import { runToolSkillRouter } from "./tool_skill_router.ts";

type RouterContext = {
  blocked_paths: RouteDecision["blocked_paths"];
  direct_effects_to_run: string[];
  active_flow_arbitration: NonNullable<
    RouteDecision["active_flow_arbitration"]
  >;
};

function researchForcesNormalReply(turnFrame: TurnFrame): boolean {
  const signal = turnFrame.needs_research;
  return signal?.value === true && Number(signal.confidence ?? 0) >= 0.55;
}

function hasFlowOpportunity(turnFrame: TurnFrame): boolean {
  return Boolean(turnFrame.flow_opportunity);
}

function hasExplicitPendingConfirmationAnswer(turnFrame: TurnFrame): boolean {
  const kind = turnFrame.confirmation_response?.kind;
  return kind === "yes" || kind === "no" || kind === "correction_to_pending";
}

function researchBlockedPaths(args: {
  skillStatus: string;
  skillId?: string | null;
  toolSkillStatus: string;
  toolSkillOperation?: string | null;
  hasOpportunity: boolean;
}): RouteDecision["blocked_paths"] {
  const blocked: RouteDecision["blocked_paths"] = [];
  if (
    args.toolSkillStatus === "start" || args.toolSkillStatus === "continue" ||
    args.toolSkillStatus === "wait_for_confirmation"
  ) {
    blocked.push({
      path: args.toolSkillOperation
        ? `tool_skill.${args.toolSkillOperation}`
        : "tool_skill",
      reason_code: "needs_research_forces_normal_reply",
    });
  }
  if (args.skillStatus !== "none" && args.skillId) {
    blocked.push({
      path: `conversation_skill.${args.skillId}`,
      reason_code: "needs_research_forces_normal_reply",
    });
  }
  if (args.hasOpportunity) {
    blocked.push({
      path: "flow_opportunity",
      reason_code: "needs_research_forces_normal_reply",
    });
  }
  return blocked;
}

function buildRouteDecision(
  context: RouterContext,
  args: {
    response_owner: ResponseOwner;
    reason_code: string;
    selected_handler?: string;
    blocked_paths?: RouteDecision["blocked_paths"];
    direct_effects_to_run?: string[];
  },
): RouteDecision {
  const decision: RouteDecision = {
    route_version: "v1",
    response_owner: args.response_owner,
    blocked_paths: args.blocked_paths ?? context.blocked_paths,
    direct_effects_to_run: args.direct_effects_to_run ??
      context.direct_effects_to_run,
    reason_code: args.reason_code,
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    active_flow_arbitration: context.active_flow_arbitration,
  };
  if (args.selected_handler !== undefined) {
    decision.selected_handler = args.selected_handler;
  }
  return decision;
}

export function runConversationRouters(input: {
  turn_frame: TurnFrame;
  active_skill_state?: unknown;
  active_tool_skill_intake?: unknown;
  pending_tool_skill_confirmation?: unknown;
  flow_intervention_context?: FlowInterventionContext;
  safety_context_risk_band: RiskBand;
}): RouteDecision {
  const skill = runSkillRouter(input);
  const toolSkill = runToolSkillRouter(input);
  const arbitration = runActiveFlowArbitrator({
    ...input,
    skill,
    tool_skill: toolSkill,
  });
  const intervention = runInterventionPolicy({
    turn_frame: input.turn_frame,
    skill,
    tool_skill: toolSkill,
    flow_intervention_context: input.flow_intervention_context,
  });
  const directEffectBlockedPaths = input.turn_frame.direct_effects
    .filter((effect) => effect.target_status !== "identified")
    .map((effect) => ({
      path: effect.effect_type,
      reason_code: effect.target_status === "ambiguous"
        ? "target_ambiguous"
        : "target_missing",
    }));
  const routeHintBlockedPaths =
    ((input.turn_frame as any).route_blocked_codes ??
      []).map((reasonCode: string) => ({
        path: "route",
        reason_code: String(reasonCode),
      }));
  const blockedPaths = [
    ...skill.blocked_paths,
    ...toolSkill.blocked_paths,
    ...arbitration.blocked_paths,
    ...intervention.blocked_paths,
    ...directEffectBlockedPaths,
    ...routeHintBlockedPaths,
  ];
  const arbitrationForRoute = {
    decision: arbitration.decision,
    active_owner: arbitration.active_owner,
    selected_owner: arbitration.selected_owner,
    resume_policy: arbitration.resume_policy,
    reason_code: arbitration.reason_code,
  };
  const runnableDirectEffects = input.turn_frame.direct_effects
    .filter((effect) => effect.target_status === "identified")
    .map((effect) => effect.effect_type);
  const routeContext: RouterContext = {
    blocked_paths: blockedPaths,
    direct_effects_to_run: runnableDirectEffects,
    active_flow_arbitration: arbitrationForRoute,
  };
  if (skill.selected_skill_id === "safety_crisis") {
    return buildRouteDecision(routeContext, {
      response_owner: "safety",
      selected_handler: "safety_crisis",
      reason_code: skill.reason_code,
      direct_effects_to_run: [],
    });
  }
  if (
    toolSkill.status === "execute_confirmed" ||
    toolSkill.status === "cancel"
  ) {
    return buildRouteDecision(routeContext, {
      response_owner: "pending_confirmation",
      selected_handler: toolSkill.status,
      reason_code: toolSkill.reason_code,
    });
  }
  if (
    input.pending_tool_skill_confirmation &&
    hasExplicitPendingConfirmationAnswer(input.turn_frame)
  ) {
    return buildRouteDecision(routeContext, {
      response_owner: "pending_confirmation",
      selected_handler: toolSkill.status,
      reason_code: toolSkill.reason_code,
    });
  }
  if (researchForcesNormalReply(input.turn_frame)) {
    return buildRouteDecision(routeContext, {
      response_owner: "normal_reply",
      blocked_paths: [
        ...blockedPaths,
        ...researchBlockedPaths({
          skillStatus: skill.status,
          skillId: skill.selected_skill_id,
          toolSkillStatus: toolSkill.status,
          toolSkillOperation: toolSkill.operation_type,
          hasOpportunity: hasFlowOpportunity(input.turn_frame),
        }),
      ],
      reason_code: "needs_research_forces_normal_reply",
    });
  }
  if (arbitration.selected_owner === "product_help") {
    return buildRouteDecision(routeContext, {
      response_owner: "product_help",
      selected_handler: "product_help",
      reason_code: arbitration.reason_code,
    });
  }
  if (
    arbitration.selected_owner === "tool_skill" &&
    (arbitration.decision === "supersede_active" ||
      arbitration.decision === "suspend_active") &&
    arbitration.selected_handler
  ) {
    return buildRouteDecision(routeContext, {
      response_owner: "tool_skill",
      selected_handler: arbitration.selected_handler,
      reason_code: arbitration.reason_code,
    });
  }
  if (
    arbitration.selected_owner === "conversation_skill" &&
    (arbitration.decision === "supersede_active" ||
      arbitration.decision === "suspend_active") &&
    arbitration.selected_handler
  ) {
    if (arbitration.selected_handler === "safety_crisis") {
      return buildRouteDecision(routeContext, {
        response_owner: "safety",
        selected_handler: "safety_crisis",
        reason_code: arbitration.reason_code,
        direct_effects_to_run: [],
      });
    }
    return buildRouteDecision(routeContext, {
      response_owner: "conversation_handler",
      selected_handler: arbitration.selected_handler,
      reason_code: arbitration.reason_code,
    });
  }
  if (
    arbitration.selected_owner === "conversation_skill" &&
    (arbitration.decision === "continue_active" ||
      arbitration.decision === "defer_incoming" ||
      arbitration.decision === "inline_answer_then_resume") &&
    arbitration.selected_handler
  ) {
    if (arbitration.selected_handler === "safety_crisis") {
      return buildRouteDecision(routeContext, {
        response_owner: "safety",
        selected_handler: "safety_crisis",
        reason_code: arbitration.reason_code,
        direct_effects_to_run: [],
      });
    }
    return buildRouteDecision(routeContext, {
      response_owner: "conversation_handler",
      selected_handler: arbitration.selected_handler,
      reason_code: arbitration.reason_code,
    });
  }
  if (
    arbitration.decision === "abandon_active" &&
    arbitration.selected_owner === "normal_reply"
  ) {
    return buildRouteDecision(routeContext, {
      response_owner: "normal_reply",
      reason_code: arbitration.reason_code,
    });
  }
  if (
    arbitration.selected_owner === "tool_skill" &&
    (arbitration.decision === "continue_active" ||
      arbitration.decision === "defer_incoming") &&
    arbitration.selected_handler
  ) {
    return buildRouteDecision(routeContext, {
      response_owner: "tool_skill",
      selected_handler: arbitration.selected_handler,
      reason_code: arbitration.reason_code,
    });
  }
  if (
    skill.selected_skill_id === "product_help" &&
    toolSkill.status !== "start" &&
    toolSkill.status !== "continue"
  ) {
    return buildRouteDecision(routeContext, {
      response_owner: "product_help",
      selected_handler: "product_help",
      blocked_paths: toolSkill.status === "wait_for_confirmation"
        ? [
          ...blockedPaths,
          {
            path: "tool_skills",
            reason_code: "product_question_interrupts_pending_confirmation",
          },
        ]
        : blockedPaths,
      reason_code: skill.reason_code,
    });
  }
  if (toolSkill.status === "wait_for_confirmation") {
    return buildRouteDecision(routeContext, {
      response_owner: "pending_confirmation",
      selected_handler: toolSkill.status,
      reason_code: toolSkill.reason_code,
    });
  }
  if (
    skill.selected_skill_id === "emotional_repair" &&
    (skill.status === "start" || skill.status === "handoff") &&
    toolSkill.status === "start"
  ) {
    if (intervention.block_conversation_skill_start) {
      return buildRouteDecision(routeContext, {
        response_owner: "normal_reply",
        reason_code: "normal_reply_fit_dominates",
      });
    }
    return buildRouteDecision(routeContext, {
      response_owner: "conversation_handler",
      selected_handler: "emotional_repair",
      blocked_paths: [
        ...blockedPaths,
        { path: "tool_skills", reason_code: "emotion_dominates" },
      ],
      reason_code: skill.reason_code,
    });
  }
  if (
    skill.selected_skill_id === "demotivation_repair" &&
    (skill.status === "start" || skill.status === "handoff") &&
    toolSkill.status === "start" &&
    toolSkill.operation_type === "prepare_attack_card" &&
    demotivationRepairOwnsAfterActionRefusal(input.turn_frame)
  ) {
    return buildRouteDecision(routeContext, {
      response_owner: "conversation_handler",
      selected_handler: "demotivation_repair",
      blocked_paths: blockedPaths,
      reason_code: "explicit_action_refusal_prefers_demotivation_repair",
    });
  }
  if (intervention.block_tool_skill_start) {
    return buildRouteDecision(routeContext, {
      response_owner: "normal_reply",
      reason_code: "normal_reply_fit_dominates",
    });
  }
  if (toolSkill.status === "start" || toolSkill.status === "continue") {
    return buildRouteDecision(routeContext, {
      response_owner: "tool_skill",
      selected_handler: toolSkill.operation_type,
      reason_code: toolSkill.reason_code,
    });
  }
  if (intervention.block_conversation_skill_start) {
    return buildRouteDecision(routeContext, {
      response_owner: "normal_reply",
      reason_code: "normal_reply_fit_dominates",
    });
  }
  if (skill.status !== "none") {
    return buildRouteDecision(routeContext, {
      response_owner: "conversation_handler",
      selected_handler: skill.selected_skill_id,
      reason_code: skill.reason_code,
    });
  }
  return buildRouteDecision(routeContext, {
    response_owner: "normal_reply",
    reason_code: "normal_reply_default",
  });
}

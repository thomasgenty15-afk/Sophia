import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runActiveFlowArbitrator } from "./active_flow_arbitrator.ts";
import { runSkillRouter } from "./skill_router.ts";
import { runToolSkillRouter } from "./tool_skill_router.ts";

export function runConversationRouters(input: {
  turn_frame: TurnFrame;
  active_skill_state?: unknown;
  active_tool_skill_intake?: unknown;
  pending_tool_skill_confirmation?: unknown;
  safety_pregate_risk_band: RiskBand;
}): RouteDecision {
  const skill = runSkillRouter(input);
  const toolSkill = runToolSkillRouter(input);
  const arbitration = runActiveFlowArbitrator({
    ...input,
    skill,
    tool_skill: toolSkill,
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
  if (skill.selected_skill_id === "safety_crisis") {
    return {
      route_version: "v1",
      response_owner: "safety",
      selected_handler: "safety_crisis",
      blocked_paths: blockedPaths,
      direct_effects_to_run: [],
      reason_code: skill.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (arbitration.selected_owner === "product_help") {
    return {
      route_version: "v1",
      response_owner: "product_help",
      selected_handler: "product_help",
      blocked_paths: blockedPaths,
      direct_effects_to_run: runnableDirectEffects,
      reason_code: arbitration.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (
    arbitration.selected_owner === "tool_skill" &&
    (arbitration.decision === "supersede_active" ||
      arbitration.decision === "suspend_active") &&
    arbitration.selected_handler
  ) {
    return {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: arbitration.selected_handler,
      blocked_paths: blockedPaths,
      direct_effects_to_run: runnableDirectEffects,
      reason_code: arbitration.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (
    arbitration.selected_owner === "conversation_skill" &&
    (arbitration.decision === "supersede_active" ||
      arbitration.decision === "suspend_active") &&
    arbitration.selected_handler
  ) {
    if (arbitration.selected_handler === "safety_crisis") {
      return {
        route_version: "v1",
        response_owner: "safety",
        selected_handler: "safety_crisis",
        blocked_paths: blockedPaths,
        direct_effects_to_run: [],
        reason_code: arbitration.reason_code,
        memory_used_for_route: false,
        memory_item_ids_used_for_route: [],
        memory_use_kind: "none",
        active_flow_arbitration: arbitrationForRoute,
      };
    }
    return {
      route_version: "v1",
      response_owner: "conversation_handler",
      selected_handler: arbitration.selected_handler,
      blocked_paths: blockedPaths,
      direct_effects_to_run: runnableDirectEffects,
      reason_code: arbitration.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (
    arbitration.selected_owner === "conversation_skill" &&
    (arbitration.decision === "continue_active" ||
      arbitration.decision === "defer_incoming" ||
      arbitration.decision === "inline_answer_then_resume") &&
    arbitration.selected_handler
  ) {
    if (arbitration.selected_handler === "safety_crisis") {
      return {
        route_version: "v1",
        response_owner: "safety",
        selected_handler: "safety_crisis",
        blocked_paths: blockedPaths,
        direct_effects_to_run: [],
        reason_code: arbitration.reason_code,
        memory_used_for_route: false,
        memory_item_ids_used_for_route: [],
        memory_use_kind: "none",
        active_flow_arbitration: arbitrationForRoute,
      };
    }
    return {
      route_version: "v1",
      response_owner: "conversation_handler",
      selected_handler: arbitration.selected_handler,
      blocked_paths: blockedPaths,
      direct_effects_to_run: runnableDirectEffects,
      reason_code: arbitration.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (
    arbitration.decision === "abandon_active" &&
    arbitration.selected_owner === "normal_reply"
  ) {
    return {
      route_version: "v1",
      response_owner: "normal_reply",
      blocked_paths: blockedPaths,
      direct_effects_to_run: runnableDirectEffects,
      reason_code: arbitration.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (
    arbitration.selected_owner === "tool_skill" &&
    (arbitration.decision === "continue_active" ||
      arbitration.decision === "defer_incoming") &&
    arbitration.selected_handler
  ) {
    return {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: arbitration.selected_handler,
      blocked_paths: blockedPaths,
      direct_effects_to_run: runnableDirectEffects,
      reason_code: arbitration.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (
    toolSkill.status === "execute_confirmed" ||
    toolSkill.status === "cancel"
  ) {
    return {
      route_version: "v1",
      response_owner: "pending_confirmation",
      selected_handler: toolSkill.status,
      blocked_paths: blockedPaths,
      direct_effects_to_run: runnableDirectEffects,
      reason_code: toolSkill.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (
    skill.selected_skill_id === "product_help" &&
    toolSkill.status !== "start" &&
    toolSkill.status !== "continue"
  ) {
    return {
      route_version: "v1",
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
      direct_effects_to_run: runnableDirectEffects,
      reason_code: skill.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (toolSkill.status === "wait_for_confirmation") {
    return {
      route_version: "v1",
      response_owner: "pending_confirmation",
      selected_handler: toolSkill.status,
      blocked_paths: blockedPaths,
      direct_effects_to_run: runnableDirectEffects,
      reason_code: toolSkill.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (
    skill.selected_skill_id === "emotional_repair" &&
    (skill.status === "start" || skill.status === "handoff") &&
    toolSkill.status === "start"
  ) {
    return {
      route_version: "v1",
      response_owner: "conversation_handler",
      selected_handler: "emotional_repair",
      blocked_paths: [
        ...blockedPaths,
        { path: "tool_skills", reason_code: "emotion_dominates" },
      ],
      direct_effects_to_run: runnableDirectEffects,
      reason_code: skill.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (toolSkill.status === "start" || toolSkill.status === "continue") {
    return {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: toolSkill.operation_type,
      blocked_paths: blockedPaths,
      direct_effects_to_run: runnableDirectEffects,
      reason_code: toolSkill.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  if (skill.status !== "none") {
    return {
      route_version: "v1",
      response_owner: "conversation_handler",
      selected_handler: skill.selected_skill_id,
      blocked_paths: blockedPaths,
      direct_effects_to_run: runnableDirectEffects,
      reason_code: skill.reason_code,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: arbitrationForRoute,
    };
  }
  return {
    route_version: "v1",
    response_owner: "normal_reply",
    blocked_paths: blockedPaths,
    direct_effects_to_run: runnableDirectEffects,
    reason_code: "normal_reply_default",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    active_flow_arbitration: arbitrationForRoute,
  };
}

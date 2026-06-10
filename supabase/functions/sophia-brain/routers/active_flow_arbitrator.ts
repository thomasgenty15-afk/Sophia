import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { SkillRouterDecision } from "./skill_router.ts";
import type { ToolSkillRouterDecision } from "./tool_skill_router.ts";

export type ActiveFlowOwner =
  | "pending_confirmation"
  | "tool_skill"
  | "conversation_skill"
  | "none";

export type ActiveFlowArbitrationDecision =
  | "continue_active"
  | "inline_answer_then_resume"
  | "start_incoming"
  | "suspend_active"
  | "supersede_active"
  | "defer_incoming"
  | "abandon_active"
  | "none";

export type ActiveFlowArbitration = {
  decision: ActiveFlowArbitrationDecision;
  active_owner: ActiveFlowOwner;
  selected_owner:
    | "pending_confirmation"
    | "tool_skill"
    | "product_help"
    | "conversation_skill"
    | "normal_reply"
    | "none";
  selected_handler?: string;
  resume_policy:
    | "auto_after_answer"
    | "after_confirmation"
    | "user_reopens"
    | "none";
  reason_code: string;
  blocked_paths: Array<{ path: string; reason_code: string }>;
};

function activeOperationType(state: unknown): string | null {
  if (
    (state as any)?.skill_id === "adjust_plan_item" &&
    (state as any)?.mode === "platform_handoff"
  ) return "adjust_plan_item";
  return typeof (state as any)?.operation_type === "string"
    ? String((state as any).operation_type)
    : null;
}

const DEPRECATED_ACTION_BREAKDOWN_SKILL_ID = "execution" + "_breakdown";

function activeSkillId(state: unknown): string | null {
  const skillId = typeof (state as any)?.skill_id === "string"
    ? String((state as any).skill_id)
    : null;
  return skillId === DEPRECATED_ACTION_BREAKDOWN_SKILL_ID ? null : skillId;
}

function isHighConfidence(confidence: unknown): boolean {
  return confidence === "high" || confidence === "critical";
}

function isExplicitHighToolIntent(
  intent: TurnFrame["tool_skill_intents"][number],
): boolean {
  return intent.explicitness === "explicit" &&
    isHighConfidence(intent.confidence_band) &&
    intent.user_intent !== "explain_only" &&
    intent.ambiguity === "none";
}

function productHelpSignal(turnFrame: TurnFrame) {
  return turnFrame.skill_signals.entry?.product_help ??
    turnFrame.skill_signals.lifecycle?.product_help ??
    null;
}

function highConversationEntrySkill(turnFrame: TurnFrame): string | null {
  const entries = turnFrame.skill_signals.entry ?? {};
  const priority = [
    "emotional_repair",
    "demotivation_repair",
  ];
  for (const skillId of priority) {
    const signal = entries[skillId];
    if (signal?.detected && isHighConfidence(signal.confidence_band)) {
      return skillId;
    }
  }
  return null;
}

function blockedToolOpportunityIfActive(
  turnFrame: TurnFrame,
  activeOwner: ActiveFlowOwner,
): Array<{ path: string; reason_code: string }> {
  void turnFrame;
  void activeOwner;
  return [];
}

export function runActiveFlowArbitrator(input: {
  turn_frame: TurnFrame;
  skill: SkillRouterDecision;
  tool_skill: ToolSkillRouterDecision;
  active_skill_state?: unknown;
  active_tool_skill_intake?: unknown;
  pending_tool_skill_confirmation?: unknown;
}): ActiveFlowArbitration {
  const activeToolOperation = activeOperationType(
    input.active_tool_skill_intake,
  );
  const activeConversationSkill = activeSkillId(input.active_skill_state);
  const activeOwner: ActiveFlowOwner = input.pending_tool_skill_confirmation
    ? "pending_confirmation"
    : activeToolOperation
    ? "tool_skill"
    : activeConversationSkill
    ? "conversation_skill"
    : "none";
  const productHelp = productHelpSignal(input.turn_frame);
  const highProductHelp = Boolean(
    productHelp?.detected && isHighConfidence(productHelp.confidence_band),
  );
  const highConversationSkill = highConversationEntrySkill(input.turn_frame);
  const opportunityBlocks = blockedToolOpportunityIfActive(
    input.turn_frame,
    activeOwner,
  );

  if (activeConversationSkill === "product_help") {
    return {
      decision: "continue_active",
      active_owner: "conversation_skill",
      selected_owner: "product_help",
      selected_handler: "product_help",
      resume_policy: "none",
      reason_code: "active_product_help_local_dispatcher_continue",
      blocked_paths: opportunityBlocks,
    };
  }

  if (activeOwner === "none") {
    return {
      decision: "none",
      active_owner: activeOwner,
      selected_owner: "none",
      resume_policy: "none",
      reason_code: "no_active_flow",
      blocked_paths: [],
    };
  }

  if (activeOwner === "pending_confirmation") {
    if (
      input.tool_skill.status === "execute_confirmed" ||
      input.tool_skill.status === "cancel" ||
      input.tool_skill.status === "continue"
    ) {
      return {
        decision: "continue_active",
        active_owner: activeOwner,
        selected_owner: "pending_confirmation",
        selected_handler: input.tool_skill.status,
        resume_policy: "after_confirmation",
        reason_code: input.tool_skill.reason_code,
        blocked_paths: opportunityBlocks,
      };
    }
    if (highProductHelp) {
      return {
        decision: "inline_answer_then_resume",
        active_owner: activeOwner,
        selected_owner: "product_help",
        selected_handler: "product_help",
        resume_policy: "after_confirmation",
        reason_code: "product_help_inline_resume_pending_confirmation",
        blocked_paths: [
          ...opportunityBlocks,
          {
            path: "pending_confirmation",
            reason_code: "product_help_inline_preserves_pending_confirmation",
          },
        ],
      };
    }
    return {
      decision: "continue_active",
      active_owner: activeOwner,
      selected_owner: "pending_confirmation",
      selected_handler: input.tool_skill.status,
      resume_policy: "after_confirmation",
      reason_code: input.tool_skill.reason_code,
      blocked_paths: opportunityBlocks,
    };
  }

  if (activeOwner === "tool_skill") {
    if (highConversationSkill) {
      return {
        decision: "suspend_active",
        active_owner: activeOwner,
        selected_owner: "conversation_skill",
        selected_handler: highConversationSkill,
        resume_policy: "auto_after_answer",
        reason_code:
          "high_conversation_skill_signal_suspends_active_tool_skill",
        blocked_paths: opportunityBlocks,
      };
    }

    const explicitOtherIntent = input.turn_frame.tool_skill_intents.find((
      intent,
    ) =>
      isExplicitHighToolIntent(intent) &&
      intent.operation_type !== activeToolOperation
    );
    if (explicitOtherIntent) {
      return {
        decision: "suspend_active",
        active_owner: activeOwner,
        selected_owner: "tool_skill",
        selected_handler: explicitOtherIntent.operation_type,
        resume_policy: "user_reopens",
        reason_code: "explicit_tool_intent_supersedes_active",
        blocked_paths: highProductHelp
          ? [
            ...opportunityBlocks,
            {
              path: "skill_signals.product_help",
              reason_code: "explicit_tool_intent_overrides_product_help",
            },
          ]
          : opportunityBlocks,
      };
    }

    if (highProductHelp) {
      return {
        decision: "inline_answer_then_resume",
        active_owner: activeOwner,
        selected_owner: "product_help",
        selected_handler: "product_help",
        resume_policy: "auto_after_answer",
        reason_code: "product_help_inline_resume_active_tool_skill",
        blocked_paths: [
          ...opportunityBlocks,
          {
            path: "tool_skills",
            reason_code: "product_help_inline_preserves_active_tool_skill",
          },
        ],
      };
    }

    if (productHelp?.detected) {
      return {
        decision: "continue_active",
        active_owner: activeOwner,
        selected_owner: "tool_skill",
        selected_handler: activeToolOperation ??
          input.tool_skill.operation_type,
        resume_policy: "none",
        reason_code: "weak_product_help_blocked_by_active_tool_skill",
        blocked_paths: [
          ...opportunityBlocks,
          {
            path: "skill_signals.product_help",
            reason_code: "weak_product_help_blocked_by_active_tool_skill",
          },
        ],
      };
    }

    return {
      decision: opportunityBlocks.length > 0
        ? "defer_incoming"
        : "continue_active",
      active_owner: activeOwner,
      selected_owner: "tool_skill",
      selected_handler: activeToolOperation ?? input.tool_skill.operation_type,
      resume_policy: "none",
      reason_code: opportunityBlocks.length > 0
        ? "active_flow_defers_flow_opportunity"
        : "active_tool_skill_continue",
      blocked_paths: opportunityBlocks,
    };
  }

  if (activeOwner === "conversation_skill") {
    const explicitToolIntent = input.turn_frame.tool_skill_intents.find(
      isExplicitHighToolIntent,
    );
    if (explicitToolIntent) {
      return {
        decision: "supersede_active",
        active_owner: activeOwner,
        selected_owner: "tool_skill",
        selected_handler: explicitToolIntent.operation_type,
        resume_policy: "user_reopens",
        reason_code:
          "explicit_tool_intent_supersedes_active_conversation_skill",
        blocked_paths: opportunityBlocks,
      };
    }
    if (input.skill.status === "exit") {
      return {
        decision: "abandon_active",
        active_owner: activeOwner,
        selected_owner: "normal_reply",
        resume_policy: "none",
        reason_code: input.skill.reason_code,
        blocked_paths: opportunityBlocks,
      };
    }
    if (
      input.skill.status === "handoff" &&
      input.skill.selected_skill_id &&
      input.skill.selected_skill_id !== activeConversationSkill
    ) {
      return {
        decision: "supersede_active",
        active_owner: activeOwner,
        selected_owner: "conversation_skill",
        selected_handler: input.skill.selected_skill_id,
        resume_policy: "auto_after_answer",
        reason_code: input.skill.reason_code,
        blocked_paths: opportunityBlocks,
      };
    }
    if (
      highProductHelp &&
      activeConversationSkill !== "product_help"
    ) {
      return {
        decision: "inline_answer_then_resume",
        active_owner: activeOwner,
        selected_owner: "product_help",
        selected_handler: "product_help",
        resume_policy: "auto_after_answer",
        reason_code: "product_help_inline_resume_active_conversation_skill",
        blocked_paths: [
          ...opportunityBlocks,
          {
            path: "conversation_skill",
            reason_code: "product_help_inline_preserves_active_skill",
          },
        ],
      };
    }
    return {
      decision: opportunityBlocks.length > 0
        ? "defer_incoming"
        : "continue_active",
      active_owner: activeOwner,
      selected_owner: "conversation_skill",
      selected_handler: activeConversationSkill ??
        input.skill.selected_skill_id,
      resume_policy: "none",
      reason_code: opportunityBlocks.length > 0
        ? "active_flow_defers_flow_opportunity"
        : "active_conversation_skill_continue",
      blocked_paths: opportunityBlocks,
    };
  }

  return {
    decision: "none",
    active_owner: activeOwner,
    selected_owner: "none",
    resume_policy: "none",
    reason_code: "active_flow_arbitration_noop",
    blocked_paths: opportunityBlocks,
  };
}

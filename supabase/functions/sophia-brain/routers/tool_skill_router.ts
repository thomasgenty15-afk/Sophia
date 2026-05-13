import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import { blocksToolSkills } from "../safety/safety_thresholds.ts";

export type ToolSkillRouterStatus =
  | "start"
  | "continue"
  | "execute_confirmed"
  | "cancel"
  | "wait_for_confirmation"
  | "blocked"
  | "none";

export type ToolSkillRouterDecision = {
  status: ToolSkillRouterStatus;
  operation_type?: string;
  reason_code: string;
  blocked_paths: Array<{ path: string; reason_code: string }>;
};

function isSafetyBlocking(risk: RiskBand): boolean {
  return blocksToolSkills(risk);
}

function activeOperationType(state: unknown): string | null {
  return typeof (state as any)?.operation_type === "string"
    ? String((state as any).operation_type)
    : null;
}

export function runToolSkillRouter(input: {
  turn_frame: TurnFrame;
  active_tool_skill_intake?: unknown;
  pending_tool_skill_confirmation?: unknown;
  safety_pregate_risk_band: RiskBand;
}): ToolSkillRouterDecision {
  if (input.pending_tool_skill_confirmation) {
    if (isSafetyBlocking(input.safety_pregate_risk_band)) {
      return {
        status: "blocked",
        reason_code: "safety_blocks_tool_skill",
        blocked_paths: [{ path: "tool_skills", reason_code: "safety_high" }],
      };
    }
    const response = input.turn_frame.confirmation_response?.kind ?? "unknown";
    const operationType =
      activeOperationType(input.pending_tool_skill_confirmation) ??
        activeOperationType(
          (input.pending_tool_skill_confirmation as any)?.draft,
        );
    if (response === "yes") {
      return {
        status: "execute_confirmed",
        operation_type: operationType ?? undefined,
        reason_code: "confirmation_yes",
        blocked_paths: [],
      };
    }
    if (response === "correction_to_pending") {
      return {
        status: "continue",
        operation_type: operationType ?? undefined,
        reason_code: "confirmation_correction_to_pending",
        blocked_paths: [],
      };
    }
    if (response === "no" || response === "topic_change") {
      return {
        status: "cancel",
        operation_type: operationType ?? undefined,
        reason_code: `confirmation_${response}`,
        blocked_paths: [],
      };
    }
    return {
      status: "wait_for_confirmation",
      operation_type: operationType ?? undefined,
      reason_code: "confirmation_unknown",
      blocked_paths: [],
    };
  }

  const active = activeOperationType(input.active_tool_skill_intake);
  if (active) {
    if (isSafetyBlocking(input.safety_pregate_risk_band)) {
      return {
        status: "blocked",
        operation_type: active,
        reason_code: "safety_blocks_tool_skill",
        blocked_paths: [{ path: "tool_skills", reason_code: "safety_high" }],
      };
    }
    return {
      status: "continue",
      operation_type: active,
      reason_code: "active_tool_skill_continue",
      blocked_paths: [],
    };
  }

  const intent =
    input.turn_frame.tool_skill_intents.find((candidate) =>
      candidate.confidence_band === "high" &&
      candidate.user_intent !== "explain_only"
    ) ?? input.turn_frame.tool_skill_intents[0];
  if (!intent) {
    return {
      status: "none",
      reason_code: "no_tool_skill_intent",
      blocked_paths: [],
    };
  }
  if (isSafetyBlocking(input.safety_pregate_risk_band)) {
    return {
      status: "blocked",
      operation_type: intent.operation_type,
      reason_code: "safety_blocks_tool_skill",
      blocked_paths: [{ path: "tool_skills", reason_code: "safety_high" }],
    };
  }
  if (intent.ambiguity !== "none") {
    return {
      status: "blocked",
      operation_type: intent.operation_type,
      reason_code: "tool_skill_target_ambiguous",
      blocked_paths: [{ path: "tool_skills", reason_code: intent.ambiguity }],
    };
  }
  return {
    status: "start",
    operation_type: intent.operation_type,
    reason_code: "tool_skill_intent_start",
    blocked_paths: [],
  };
}

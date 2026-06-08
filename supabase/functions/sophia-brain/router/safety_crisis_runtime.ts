import type { runSafetyPregate } from "../safety/safety_pregate.ts";
import { isAtLeast } from "../safety/safety_thresholds.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type {
  RiskBand,
  ToolSkillOpportunity,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";

const EMPTY_TOOL_SKILL_OPPORTUNITY: ToolSkillOpportunity = {
  type: "none",
  operation_type: null,
  surface_id: null,
  confidence_band: "low",
  should_offer: false,
  prop_reason: null,
  source_span: null,
  target_hint: null,
  target_status: "none",
  suggested_question_intent: null,
  offer_timing: "never",
  must_not_execute: true,
};

export function isSafetyRoute(routeDecision: RouteDecision | null): boolean {
  return routeDecision?.response_owner === "safety";
}

export function isActiveSafetyCrisisSkillState(value: unknown): boolean {
  const record = value as any;
  if (!record || typeof record !== "object") return false;
  if (String(record.skill_id ?? "") !== "safety_crisis") return false;
  const phase = String(record.working_state?.phase ?? "").trim();
  return phase !== "resolved" &&
    String(record.status ?? "active") !== "exiting";
}

export function withActiveSafetyFlowCaution<
  T extends ReturnType<typeof runSafetyPregate>,
>(
  output: T,
  tempMemory: unknown,
): T {
  if (
    !isActiveSafetyCrisisSkillState(
      (tempMemory as any)?.__active_skill_state ??
        (tempMemory as any)?.active_skill_state,
    )
  ) return output;
  if (
    output.risk_band !== "none" &&
    output.risk_band !== "low"
  ) return output;
  return {
    ...output,
    detected: true,
    risk_band: "medium",
    reason_codes: [
      ...new Set([
        ...(output.reason_codes ?? []),
        "active_safety_flow_caution",
      ]),
    ],
    layer_contributions: {
      ...output.layer_contributions,
      heuristic: true,
    },
    allow_side_effects: false,
  };
}

export function selectedConversationSkillForRoute(
  routeDecision: RouteDecision | null,
): string {
  if (isSafetyRoute(routeDecision)) return "safety_crisis";
  if (routeDecision?.response_owner === "product_help") return "product_help";
  if (routeDecision?.response_owner === "conversation_handler") {
    return String(routeDecision?.selected_handler ?? "").trim();
  }
  return "";
}

export function runtimeSafetyPregateForTurn<
  T extends ReturnType<typeof runSafetyPregate>,
>(args: {
  safetyPregateOutput: T;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: unknown;
  userMessage: string;
}): { riskBand: RiskBand; pregateOutput: T } {
  void args.userMessage;
  void args.tempMemory;
  void args.routeDecision;
  const safetyFloorRiskBand: RiskBand = args.safetyPregateOutput.risk_band;
  const riskBand = args.turnFrame?.safety?.risk_band &&
      isAtLeast(args.turnFrame.safety.risk_band, safetyFloorRiskBand)
    ? args.turnFrame.safety.risk_band
    : safetyFloorRiskBand;
  return {
    riskBand,
    pregateOutput: riskBand === args.safetyPregateOutput.risk_band
      ? args.safetyPregateOutput
      : { ...args.safetyPregateOutput, risk_band: riskBand },
  };
}

export function applySafetyCrisisExitStateIfNeeded(args: {
  tempMemory: Record<string, unknown>;
  selectedSkillId: string;
  skillOutput?: ConversationSkillOutput | null;
  previous: Record<string, unknown>;
  workingState: Record<string, unknown>;
  now: string;
}): Record<string, unknown> | null {
  if (
    args.selectedSkillId !== "safety_crisis" ||
    args.skillOutput?.status !== "exit" ||
    args.skillOutput.state_patch?.phase !== "resolved"
  ) return null;
  const next = { ...args.tempMemory };
  next.__last_safety_crisis_state = {
    ...args.previous,
    skill_id: args.selectedSkillId,
    status: "exiting",
    turn_count: Number(args.previous.turn_count ?? 0) + 1,
    updated_at: args.now,
    resolved_at: args.now,
    working_state: {
      ...args.workingState,
      phase: "resolved",
      exit_memo: args.skillOutput.state_patch?.exit_memo ??
        args.workingState.exit_memo ?? null,
    },
  };
  delete next.__active_skill_state;
  delete next.active_skill_state;
  return next;
}

export function directSafetyCrisisReplyOverride(args: {
  routeDecision: RouteDecision | null;
  skillOutput: ConversationSkillOutput | null;
}): string | null {
  if (!isSafetyRoute(args.routeDecision)) return null;
  if (args.skillOutput?.skill_id !== "safety_crisis") return null;
  const reply = String(args.skillOutput.reply ?? "").trim();
  return reply || null;
}

export function suppressToolSignalsForSafetyRoute(args: {
  routeDecision: RouteDecision;
  turnFrame: TurnFrame | null;
}): {
  routeDecision: RouteDecision;
  turnFrame: TurnFrame | null;
  changed: boolean;
} {
  if (!isSafetyRoute(args.routeDecision) || !args.turnFrame) {
    return {
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      changed: false,
    };
  }
  const hasSuppressionMarker = args.routeDecision.blocked_paths.some((path) =>
    path.path === "tool_signals" &&
    path.reason_code === "safety_route_suppresses_tool_signals"
  );
  return {
    routeDecision: {
      ...args.routeDecision,
      direct_effects_to_run: [],
      blocked_paths: hasSuppressionMarker ? args.routeDecision.blocked_paths : [
        ...args.routeDecision.blocked_paths,
        {
          path: "tool_signals",
          reason_code: "safety_route_suppresses_tool_signals",
        },
      ],
    },
    turnFrame: {
      ...args.turnFrame,
      tool_skill_intents: [],
      direct_effects: [],
      tool_skill_opportunity: EMPTY_TOOL_SKILL_OPPORTUNITY,
    },
    changed: true,
  };
}

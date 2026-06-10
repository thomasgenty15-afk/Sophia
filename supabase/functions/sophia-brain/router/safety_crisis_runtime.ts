import type { runSafetyPregate } from "../safety/safety_pregate.ts";
import { isAtLeast } from "../safety/safety_thresholds.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import {
  createNoteInformation,
  type NoteInformation,
} from "../contracts/note_information.v1.ts";

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

export function shouldSkipGlobalDispatcherForSafetyLocalTurn(args: {
  activeSkillState: unknown;
  safetyPregateOutput: {
    risk_band: RiskBand;
    reason_codes?: string[];
  };
}): boolean {
  const safetyMediumReasonsThatOwnLocalFlow = new Set([
    "recent_safety_context_caution",
    "passive_ideation_negated_medium_caution",
    "recent_safety_negated_medium_caution",
    "active_safety_flow_caution",
    "passive_disappear_ideation",
    "passive_absence_ideation",
    "explicit_suicidal_thoughts",
  ]);
  return isActiveSafetyCrisisSkillState(args.activeSkillState) ||
    isAtLeast(args.safetyPregateOutput.risk_band, "high") ||
    (args.safetyPregateOutput.risk_band === "medium" &&
      (args.safetyPregateOutput.reason_codes ?? []).some((reason) =>
        safetyMediumReasonsThatOwnLocalFlow.has(String(reason))
      ));
}

function safetyActivationRiskScore(riskBand: RiskBand): number {
  switch (riskBand) {
    case "critical":
      return 10;
    case "high":
      return 8;
    case "medium":
      return 5;
    case "low":
      return 2;
    case "none":
      return 0;
  }
}

export function buildSafetyCrisisActivationNoteInformation(args: {
  userMessage: string;
  sourceMessageId?: string | null;
  requestId?: string | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
}): NoteInformation {
  const activeFlowSummary =
    "No active safety_crisis state existed before this turn; safety pregate selected the safety local dispatcher.";
  const collectedState = {
    first_activation: true,
    source_message_id: args.sourceMessageId ?? null,
    request_id: args.requestId ?? null,
    safety_pregate: {
      detected: args.safetyPregateOutput.detected,
      risk_band: args.safetyPregateOutput.risk_band,
      reason_codes: args.safetyPregateOutput.reason_codes ?? [],
      evidence: args.safetyPregateOutput.evidence ?? [],
    },
  };
  const evidence = [
    ...(args.safetyPregateOutput.evidence ?? []),
    ...(args.userMessage ? [`user_message:${args.userMessage}`] : []),
  ].slice(0, 8);
  return createNoteInformation({
    source_flow_id: "global",
    source_flow_presentation:
      "Global routing boundary handing first ownership to the safety_crisis local dispatcher.",
    source_flow_state_summary: activeFlowSummary,
    handoff_reason: "safety",
    target_dispatcher: "safety_crisis",
    handoff_context_for_next_dispatcher:
      "Safety pregate selected safety_crisis for first local ownership on this turn. The safety local dispatcher must own routing and produce the conversation_context.",
    target_local_dispatcher_hint:
      "Start safety_crisis from pregate risk context; defer product, status, reminder, plan, card, and potion work.",
    user_words: args.userMessage ? [args.userMessage] : [],
    structured_context: {
      source_flow: "global",
      target_dispatcher: "safety_crisis",
      handoff_reason: "safety",
      user_message_summary: args.userMessage || null,
      active_flow_summary: activeFlowSummary,
      collected_state: collectedState,
      unresolved_questions: [
        "immediate_danger_absent",
        "means_safe",
        "human_support_available",
      ],
      confidence: args.safetyPregateOutput.risk_band === "critical" ||
          args.safetyPregateOutput.risk_band === "high"
        ? "high"
        : "medium",
      evidence,
      recommended_next_focus:
        "Assess immediate danger, means proximity, whether the user is alone, and human or emergency support.",
    },
    risk_score: safetyActivationRiskScore(args.safetyPregateOutput.risk_band),
  });
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
      active_flow_caution: true,
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
    args.skillOutput?.status !== "exit"
  ) return null;
  const visibleTaskKind = String(
    (args.skillOutput.state_patch?.visible_task as any)?.kind ?? "",
  );
  const resolved = args.skillOutput.state_patch?.phase === "resolved";
  const stopLocalNoHandoff = visibleTaskKind === "stop_or_cancel";
  if (!resolved && !stopLocalNoHandoff) return null;
  const next = { ...args.tempMemory };
  const exitMemo = args.skillOutput.state_patch?.exit_memo ??
    args.workingState.exit_memo ?? null;
  if (resolved && exitMemo && typeof exitMemo === "object") {
    next.__last_safety_crisis_exit_memo = {
      ...(exitMemo as Record<string, unknown>),
      at: args.now,
      note_information: (exitMemo as any).note_information ?? null,
    };
  }
  next.__last_safety_crisis_state = {
    ...args.previous,
    skill_id: args.selectedSkillId,
    status: "exiting",
    turn_count: Number(args.previous.turn_count ?? 0) + 1,
    updated_at: args.now,
    resolved_at: args.now,
    working_state: {
      ...args.workingState,
      phase: resolved ? "resolved" : args.workingState.phase,
      exit_memo: exitMemo,
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
      flow_opportunity: null,
    },
    changed: true,
  };
}

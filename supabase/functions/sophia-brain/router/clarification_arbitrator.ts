import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  buildClarificationRequest,
  type ClarificationCandidate,
  type ClarificationToolOutput,
} from "../clarification/contract.ts";
import { renderClarificationQuestion } from "../clarification/renderer.ts";
import {
  type ClarificationState,
  clearClarificationState,
  readClarificationState,
  writeClarificationState,
} from "../clarification/state.ts";
import {
  type ClarificationLlmRunner,
  runClarificationTool,
} from "../clarification/tool.ts";
import {
  buildActiveSkillClarificationCandidatesFromTurnFrame,
  buildClarificationCandidatesFromTurnFrame,
} from "./clarification_candidate_builder.ts";

const EXECUTABLE_SIGNAL_IDS = new Set([
  "create_one_shot_reminder",
  "cancel_one_shot_reminder",
  "create_recurring_reminder",
  "prepare_attack_card",
  "prepare_defense_card",
  "adjust_plan_item",
  "select_state_potion",
  "update_coach_preferences",
  "track_progress_plan_item",
]);

export type DispatcherClarificationArbitrationResult =
  | {
    status: "none";
    turnFrame: TurnFrame;
    tempMemory: Record<string, unknown>;
  }
  | {
    status: "ask";
    turnFrame: TurnFrame;
    tempMemory: Record<string, unknown>;
    routeDecision: RouteDecision;
    output: ClarificationToolOutput;
    visibleQuestion: string;
  }
  | {
    status: "resolved" | "cancelled" | "topic_change";
    turnFrame: TurnFrame;
    tempMemory: Record<string, unknown>;
    output: ClarificationToolOutput;
    selectedCandidate?: ClarificationCandidate | null;
  };

export type ActiveSkillClarificationArbitrationResult =
  DispatcherClarificationArbitrationResult;

function routeDecisionForClarification(): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "orientation_clarification",
    selected_handler: "orientation_clarification",
    blocked_paths: [
      { path: "tool_skill_router", reason_code: "clarification_required" },
      { path: "product_help", reason_code: "clarification_required" },
      {
        path: "operation_runtime_pipeline",
        reason_code: "clarification_required",
      },
      { path: "direct_effects", reason_code: "clarification_required" },
    ],
    direct_effects_to_run: [],
    reason_code: "clarification_required",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  };
}

function suppressExecutableSignals(turnFrame: TurnFrame): TurnFrame {
  const preservedEntry = Object.fromEntries(
    Object.entries(turnFrame.skill_signals?.entry ?? {}).filter(([skillId]) =>
      !EXECUTABLE_SIGNAL_IDS.has(skillId)
    ),
  );
  return {
    ...turnFrame,
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: {
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
    },
    skill_signals: {
      ...(turnFrame.skill_signals ?? {}),
      entry: preservedEntry,
    },
  };
}

function stateFromRequest(args: {
  clarificationId: string;
  owner: ClarificationState["owner"];
  ambiguityKind: ClarificationState["ambiguity_kind"];
  candidates: ClarificationState["candidates"];
  knownContext?: Record<string, unknown>;
  previous?: ClarificationState | null;
}): ClarificationState {
  const now = new Date().toISOString();
  return {
    skill_id: "orientation_clarification",
    clarification_id: args.clarificationId,
    owner: args.owner,
    ambiguity_kind: args.ambiguityKind,
    candidates: args.candidates,
    known_context: args.knownContext,
    turn_count: Math.min(Number(args.previous?.turn_count ?? 0) + 1, 99),
    max_turns: Number(args.previous?.max_turns ?? 2) || 2,
    created_at: args.previous?.created_at ?? now,
    no_chat_mutation: true,
  };
}

function none(
  turnFrame: TurnFrame,
  tempMemory: unknown,
): DispatcherClarificationArbitrationResult {
  return {
    status: "none",
    turnFrame,
    tempMemory: typeof tempMemory === "object" && tempMemory
      ? { ...(tempMemory as Record<string, unknown>) }
      : {},
  };
}

export async function maybeStartDispatcherClarification(args: {
  turnFrame: TurnFrame;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  tempMemory: unknown;
  llmRunner?: ClarificationLlmRunner;
  modelName?: string;
  requestId?: string | null;
  userTurnSnapshot?: unknown;
}): Promise<DispatcherClarificationArbitrationResult> {
  if (!args.llmRunner) return none(args.turnFrame, args.tempMemory);
  if (
    args.turnFrame.safety.risk_band === "high" ||
    args.turnFrame.safety.risk_band === "critical"
  ) return none(args.turnFrame, args.tempMemory);

  const previous = readClarificationState(args.tempMemory);
  const built = previous
    ? {
      ambiguity_kind: previous.ambiguity_kind,
      candidates: previous.candidates,
      known_context: previous.known_context ?? {},
    }
    : buildClarificationCandidatesFromTurnFrame(args.turnFrame);
  if (!built || built.candidates.length < 2) {
    return none(args.turnFrame, args.tempMemory);
  }

  const clarificationId = previous?.clarification_id ??
    `${args.turnFrame.turn_id}:dispatcher_clarification`;
  const request = buildClarificationRequest({
    clarification_id: clarificationId,
    owner: previous?.owner ?? "dispatcher",
    ambiguity_kind: built.ambiguity_kind,
    user_message: args.userMessage,
    recent_messages: args.recentMessages,
    active_flow_state: args.userTurnSnapshot ?? null,
    known_context: built.known_context,
    candidates: built.candidates,
  });
  const output = await runClarificationTool({
    request,
    previous_state: previous,
    llm_runner: args.llmRunner,
    model_name: args.modelName,
    request_id: args.requestId ?? null,
  });

  if (output.status === "ask" || output.status === "still_ambiguous") {
    const nextState = stateFromRequest({
      clarificationId,
      owner: request.owner,
      ambiguityKind: request.ambiguity_kind,
      candidates: request.candidates,
      knownContext: request.known_context,
      previous,
    });
    const tempMemory = writeClarificationState(args.tempMemory, nextState);
    const visibleQuestion = renderClarificationQuestion(output);
    return {
      status: "ask",
      turnFrame: suppressExecutableSignals(args.turnFrame),
      tempMemory,
      routeDecision: routeDecisionForClarification(),
      output,
      visibleQuestion,
    };
  }

  if (
    output.status === "resolved" ||
    output.status === "cancelled" ||
    output.status === "topic_change"
  ) {
    const selectedCandidate = request.candidates.find((candidate) =>
      candidate.id === output.selected_candidate_id
    ) ?? null;
    return {
      status: output.status,
      turnFrame: suppressExecutableSignals(args.turnFrame),
      tempMemory: clearClarificationState(args.tempMemory),
      output,
      selectedCandidate,
    };
  }

  return none(args.turnFrame, args.tempMemory);
}

export async function maybeStartActiveSkillClarification(args: {
  turnFrame: TurnFrame;
  activeSkillState: unknown;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  tempMemory: unknown;
  llmRunner?: ClarificationLlmRunner;
  modelName?: string;
  requestId?: string | null;
  userTurnSnapshot?: unknown;
}): Promise<ActiveSkillClarificationArbitrationResult> {
  if (!args.llmRunner) return none(args.turnFrame, args.tempMemory);
  if (
    args.turnFrame.safety.risk_band === "high" ||
    args.turnFrame.safety.risk_band === "critical"
  ) return none(args.turnFrame, args.tempMemory);

  const activeOwner = String(
    (args.activeSkillState as { skill_id?: unknown } | null)?.skill_id ?? "",
  ).trim();
  if (!activeOwner) return none(args.turnFrame, args.tempMemory);

  const previous = readClarificationState(args.tempMemory);
  if (previous && previous.owner !== activeOwner) {
    return none(args.turnFrame, args.tempMemory);
  }

  const built = previous
    ? {
      owner: previous.owner,
      ambiguity_kind: previous.ambiguity_kind,
      candidates: previous.candidates,
      known_context: previous.known_context ?? {},
    }
    : buildActiveSkillClarificationCandidatesFromTurnFrame({
      turnFrame: args.turnFrame,
      activeSkillState: args.activeSkillState,
      userMessage: args.userMessage,
    });
  if (!built || built.candidates.length < 2) {
    return none(args.turnFrame, args.tempMemory);
  }

  const clarificationId = previous?.clarification_id ??
    `${args.turnFrame.turn_id}:${built.owner}:clarification`;
  const request = buildClarificationRequest({
    clarification_id: clarificationId,
    owner: built.owner,
    ambiguity_kind: built.ambiguity_kind,
    user_message: args.userMessage,
    recent_messages: args.recentMessages,
    active_flow_state: args.activeSkillState ?? args.userTurnSnapshot ?? null,
    known_context: built.known_context,
    candidates: built.candidates,
  });
  const output = await runClarificationTool({
    request,
    previous_state: previous,
    llm_runner: args.llmRunner,
    model_name: args.modelName,
    request_id: args.requestId ?? null,
  });

  if (output.status === "ask" || output.status === "still_ambiguous") {
    const nextState = stateFromRequest({
      clarificationId,
      owner: request.owner,
      ambiguityKind: request.ambiguity_kind,
      candidates: request.candidates,
      knownContext: request.known_context,
      previous,
    });
    const tempMemory = writeClarificationState(args.tempMemory, nextState);
    const visibleQuestion = renderClarificationQuestion(output);
    return {
      status: "ask",
      turnFrame: suppressExecutableSignals(args.turnFrame),
      tempMemory,
      routeDecision: routeDecisionForClarification(),
      output,
      visibleQuestion,
    };
  }

  if (
    output.status === "resolved" ||
    output.status === "cancelled" ||
    output.status === "topic_change"
  ) {
    const selectedCandidate = request.candidates.find((candidate) =>
      candidate.id === output.selected_candidate_id
    ) ?? null;
    return {
      status: output.status,
      turnFrame: suppressExecutableSignals(args.turnFrame),
      tempMemory: clearClarificationState(args.tempMemory),
      output,
      selectedCandidate,
    };
  }

  return none(args.turnFrame, args.tempMemory);
}

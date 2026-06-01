import { baseOutput, type RunSkillInput } from "../_shared/skill_helpers.ts";
import { conversationEffectsFromCandidates } from "../_shared/conversation_skill_contract.ts";
import {
  applyExecutionInvariants,
  EXECUTION_BREAKDOWN_SKILL_ID,
  type ExecutionIntakeResult,
  toConversationOperationSuggestions,
  toMemoryWriteCandidates,
} from "./contract.ts";
import { renderExecutionBreakdownReply } from "./renderer.ts";

export function reduceExecutionBreakdownTurn(args: {
  run_input: RunSkillInput;
  intake: ExecutionIntakeResult;
}) {
  const decision = applyExecutionInvariants(args.intake.decision);
  const operationSuggestions = args.intake.ok
    ? toConversationOperationSuggestions(decision.operation_suggestions ?? [])
    : [];
  const memoryWriteCandidates = args.intake.ok
    ? toMemoryWriteCandidates(
      decision.memory_write_candidates ?? [],
      args.run_input.context.turn_frame.source_message_id,
    )
    : [];
  const handoffRequest = args.intake.ok ? decision.handoff_request : undefined;
  const status = handoffRequest
    ? "handoff"
    : args.intake.ok && decision.phase === "exit"
    ? "exit"
    : "continue";

  return baseOutput(EXECUTION_BREAKDOWN_SKILL_ID, {
    status,
    response_intent: !args.intake.ok
      ? "technical_intake_failure"
      : handoffRequest
      ? "handoff_to_emotional_repair"
      : decision.phase,
    reply: renderExecutionBreakdownReply({
      decision,
      intake_ok: args.intake.ok,
    }),
    diagnosis: {
      stage: !args.intake.ok
        ? "technical_fallback"
        : decision.phase === "resolve_target"
        ? "target_resolution"
        : decision.phase === "handoff_to_emotional_repair"
        ? "handoff"
        : "diagnosis",
      target: args.intake.ok ? decision.target : {
        kind: "unknown",
        confidence_band: "low",
      },
      blocker: args.intake.ok ? decision.blocker : "unknown",
      action_readiness: args.intake.ok ? decision.action_readiness : "none",
      emotional_dominance: args.intake.ok
        ? decision.emotional_dominance
        : "low",
      constraints: decision.constraints,
      response_contract: decision.response_contract,
      execution_decision: args.intake.ok ? decision : null,
      intake_status: args.intake.ok ? "ok" : "technical_fallback",
      intake_reason: args.intake.ok ? undefined : args.intake.reason,
    },
    recommendation_need: {
      needed: operationSuggestions.length > 0 ||
        (args.intake.ok && decision.phase === "resolve_target"),
      type: "execution_repair",
      urgency: operationSuggestions.length > 0 ? "medium" : "low",
      constraints: decision.constraints,
    },
    handoff_request: handoffRequest,
    operation_suggestions: operationSuggestions,
    memory_write_candidates: memoryWriteCandidates,
    effects: conversationEffectsFromCandidates({
      intake_failed: !args.intake.ok,
      missing_slots: args.intake.ok && decision.phase === "resolve_target"
        ? ["target"]
        : [],
      operation_suggestions: operationSuggestions,
      memory_write_candidates: memoryWriteCandidates,
      handoff_request: handoffRequest,
    }),
    state_patch: {
      ...(args.intake.ok ? decision.state_patch : {}),
      execution_decision: args.intake.ok ? decision : null,
      intake_status: args.intake.ok ? "ok" : "technical_fallback",
      intake_reason: args.intake.ok ? undefined : args.intake.reason,
    },
  });
}

export const EXECUTION_BREAKDOWN_REDUCER_INVARIANTS = [
  "intake_failure_no_durable_effect",
  "missing_target_blocks_durable_effect",
  "operation_suggestion_is_not_tool_execution",
  "handoff_has_no_direct_write",
] as const;

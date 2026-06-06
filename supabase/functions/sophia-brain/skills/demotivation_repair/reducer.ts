import { baseOutput, type RunSkillInput } from "../_shared/skill_helpers.ts";
import { conversationEffectsFromCandidates } from "../_shared/conversation_skill_contract.ts";
import {
  type DemotivationRepairIntakeResult,
  normalizeDemotivationRepairDecision,
  toConversationOperationSuggestions,
  toMemoryWriteCandidates,
} from "./contract.ts";
import { renderDemotivationRepairReply } from "./renderer.ts";

export function reduceDemotivationRepairTurn(args: {
  run_input: RunSkillInput;
  intake: DemotivationRepairIntakeResult;
}) {
  const decision = normalizeDemotivationRepairDecision(args.intake.decision);
  const operationSuggestions = args.intake.ok
    ? toConversationOperationSuggestions(decision.operation_suggestions ?? [])
    : [];
  const memoryWriteCandidates = args.intake.ok
    ? toMemoryWriteCandidates(
      decision.memory_write_candidates ?? [],
      args.run_input.context.turn_frame.source_message_id,
    )
    : [];
  return baseOutput("demotivation_repair", {
    status: "continue",
    response_intent: !args.intake.ok
      ? "technical_intake_failure"
      : decision.intent,
    reply: renderDemotivationRepairReply({
      decision,
      intake_ok: args.intake.ok,
    }),
    diagnosis: {
      intent: args.intake.ok ? decision.intent : "unclear",
      phase: args.intake.ok ? decision.phase : "diagnose",
      motivation_state: args.intake.ok ? decision.motivation_state : "unclear",
      action_readiness: args.intake.ok ? decision.action_readiness : "none",
      constraints: decision.constraints,
      response_contract: decision.response_contract,
      intake_status: args.intake.ok ? "structured" : "technical_fallback",
      intake_reason: args.intake.ok ? undefined : args.intake.reason,
    },
    recommendation_need: {
      needed: operationSuggestions.length > 0,
      type: operationSuggestions.length > 0 ? "motivation_repair" : "none",
      urgency: operationSuggestions.length > 0 ? "medium" : "none",
      constraints: decision.constraints,
    },
    operation_suggestions: operationSuggestions,
    memory_write_candidates: memoryWriteCandidates,
    effects: conversationEffectsFromCandidates({
      intake_failed: !args.intake.ok,
      operation_suggestions: operationSuggestions,
      memory_write_candidates: memoryWriteCandidates,
    }),
    state_patch: {
      ...(args.intake.ok ? decision.state_patch : {}),
      intake_status: args.intake.ok ? "structured" : "technical_fallback",
      intake_reason: args.intake.ok ? undefined : args.intake.reason,
      demotivation_repair_decision: args.intake.ok ? decision : null,
    },
  });
}

export const DEMOTIVATION_REPAIR_REDUCER_INVARIANTS = [
  "intake_failure_no_durable_effect",
  "missing_or_failed_intake_no_operation_suggestion",
  "handoff_has_no_direct_write",
  "memory_candidates_are_not_committed",
] as const;

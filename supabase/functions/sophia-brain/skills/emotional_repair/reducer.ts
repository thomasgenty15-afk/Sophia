import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import {
  baseOutput,
  type RunSkillInput,
  statementCandidate,
} from "../_shared/skill_helpers.ts";
import {
  conversationEffectsFromCandidates,
  emptyConversationEffects,
} from "../_shared/conversation_skill_contract.ts";
import {
  applyEmotionalRepairInvariants,
  type EmotionalRepairConstraint,
  type EmotionalRepairMemoryWriteCandidate,
  type EmotionalRepairSkillDecision,
  normalizeEmotionalRepairConstraints,
  toConversationOperationSuggestion,
  validateEmotionalRepairDecision,
} from "./contract.ts";
import {
  buildFallbackEmotionalRepairDecision,
  renderSafeEmotionalRepairReply,
} from "./renderer.ts";

export type EmotionalRepairReductionInput = {
  run_input: RunSkillInput;
  intake_decision: EmotionalRepairSkillDecision | null;
  intake_errors: string[];
  intake_trace?: Record<string, unknown>;
  explicit_constraints?: unknown;
};

function statusForDecision(decision: EmotionalRepairSkillDecision) {
  if (decision.handoff_request) return "handoff" as const;
  if (decision.phase === "exit") return "exit" as const;
  return "continue" as const;
}

function responseIntentForDecision(decision: EmotionalRepairSkillDecision) {
  if (decision.handoff_request?.target_skill_id === "safety_crisis") {
    return "handoff_to_safety";
  }
  return decision.phase;
}

function normalizedMemoryText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function containsIdentityAttack(text: string): boolean {
  const normalized = normalizedMemoryText(text);
  return [
    "je suis nul",
    "je suis nulle",
    "je suis incapable",
    "je suis un echec",
    "je suis une echec",
    "je suis toxique",
    "je suis un boulet",
    "je suis une boulet",
    "je me degoute",
  ].some((fragment) => normalized.includes(fragment));
}

function contextualMemoryTextForDecision(
  decision: EmotionalRepairSkillDecision,
): string {
  if (
    decision.context_domain === "relationship" ||
    decision.constraints.includes("relationship_context")
  ) {
    return "L'utilisateur demande une réparation relationnelle sobre après une parole sèche.";
  }
  return "Episode de honte dans le tour courant; ne pas figer comme identité.";
}

function sanitizeEmotionalRepairMemoryCandidates(
  decision: EmotionalRepairSkillDecision,
): EmotionalRepairMemoryWriteCandidate[] {
  const identitySensitive = decision.intent === "acute_self_attack" ||
    decision.constraints.includes("do_not_persist_identity_attack");
  return (decision.memory_write_candidates ?? []).map((candidate) => {
    const shouldContextualize = identitySensitive &&
      containsIdentityAttack(candidate.source_text);
    return {
      ...candidate,
      source_text: shouldContextualize
        ? contextualMemoryTextForDecision(decision)
        : candidate.source_text,
      should_persist_default: false as const,
      anti_identity_freeze_checked: true as const,
    };
  });
}

function memoryCandidatesFromDecision(
  input: RunSkillInput,
  decision: EmotionalRepairSkillDecision,
) {
  return sanitizeEmotionalRepairMemoryCandidates(decision).map((candidate) =>
    statementCandidate(
      candidate.source_text,
      input.context.turn_frame.source_message_id,
      candidate.sensitivity_level,
      false,
    )
  );
}

function validationIsReplyOnly(errors: string[]) {
  return errors.length > 0 &&
    errors.every((error) => error.startsWith("reply_"));
}

function mergeExplicitUserConstraints(
  decision: EmotionalRepairSkillDecision,
  explicitConstraints: unknown,
): EmotionalRepairSkillDecision {
  const constraints = new Set<EmotionalRepairConstraint>(decision.constraints);
  for (
    const constraint of normalizeEmotionalRepairConstraints(explicitConstraints)
  ) {
    constraints.add(constraint);
  }
  return {
    ...decision,
    constraints: [...constraints],
  };
}

function withSafeRenderedReply(
  decision: EmotionalRepairSkillDecision,
  errors: string[],
): EmotionalRepairSkillDecision {
  return {
    ...decision,
    reply: renderSafeEmotionalRepairReply({
      decision,
      reason: "validation_failure",
    }),
    state_patch: {
      ...decision.state_patch,
      fallback_reason: "validation_failure",
      validation_errors: errors,
    },
  };
}

function outputFromDecision(
  input: RunSkillInput,
  decision: EmotionalRepairSkillDecision,
): ConversationSkillOutput {
  const operationSuggestions = (decision.operation_suggestions ?? []).map(
    toConversationOperationSuggestion,
  );
  const memoryWriteCandidates = memoryCandidatesFromDecision(input, decision);
  return baseOutput("emotional_repair", {
    status: statusForDecision(decision),
    response_intent: responseIntentForDecision(decision),
    reply: decision.reply,
    diagnosis: {
      intent: decision.intent,
      phase: decision.phase,
      emotional_dominance: decision.emotional_dominance,
      context_domain: decision.context_domain,
      constraints: decision.constraints,
      response_contract: decision.response_contract,
    },
    recommendation_need: {
      needed: operationSuggestions.length > 0,
      type: operationSuggestions.some((suggestion) =>
          suggestion.operation_type === "select_state_potion"
        )
        ? "state_regulation"
        : "none",
      urgency: operationSuggestions.length > 0 ? "medium" : "none",
      constraints: decision.constraints,
    },
    operation_suggestions: operationSuggestions,
    handoff_request: decision.handoff_request,
    memory_write_candidates: memoryWriteCandidates,
    effects: conversationEffectsFromCandidates({
      operation_suggestions: operationSuggestions,
      memory_write_candidates: memoryWriteCandidates,
      handoff_request: decision.handoff_request,
    }),
    state_patch: {
      ...decision.state_patch,
      emotional_repair_decision: {
        skill_id: decision.skill_id,
        intent: decision.intent,
        phase: decision.phase,
        emotional_dominance: decision.emotional_dominance,
        context_domain: decision.context_domain,
        constraints: decision.constraints,
        response_contract: decision.response_contract,
        handoff_request: decision.handoff_request ?? null,
      },
    },
  });
}

export function reduceEmotionalRepairTurn(
  input: EmotionalRepairReductionInput,
): ConversationSkillOutput {
  if (!input.intake_decision) {
    const constraints = normalizeEmotionalRepairConstraints(
      input.explicit_constraints,
    );
    const fallback = applyEmotionalRepairInvariants(
      buildFallbackEmotionalRepairDecision({
        constraints,
        reason: "intake_failure",
      }),
    );
    const output = outputFromDecision(input.run_input, {
      ...fallback,
      state_patch: {
        ...fallback.state_patch,
        intake_status: "technical_fallback",
        intake_errors: input.intake_errors,
        intake_trace: input.intake_trace ?? null,
      },
    });
    return {
      ...output,
      response_intent: "technical_intake_failure",
      diagnosis: {
        ...(output.diagnosis ?? {}),
        intake_status: "technical_fallback",
        intake_errors: input.intake_errors,
        intake_trace: input.intake_trace ?? null,
      },
      effects: conversationEffectsFromCandidates({ intake_failed: true }),
      state_patch: {
        ...(output.state_patch ?? {}),
        intake_status: "technical_fallback",
        intake_errors: input.intake_errors,
        intake_trace: input.intake_trace ?? null,
      },
    };
  }

  const decision = applyEmotionalRepairInvariants(
    mergeExplicitUserConstraints(
      input.intake_decision,
      input.explicit_constraints,
    ),
  );
  const validation = validateEmotionalRepairDecision(decision);
  if (!validation.ok) {
    if (validationIsReplyOnly(validation.errors)) {
      const rendered = applyEmotionalRepairInvariants(
        withSafeRenderedReply(decision, validation.errors),
      );
      const renderedValidation = validateEmotionalRepairDecision(rendered);
      if (renderedValidation.ok) {
        return outputFromDecision(input.run_input, rendered);
      }
    }
    const fallback = applyEmotionalRepairInvariants(
      buildFallbackEmotionalRepairDecision({
        decision,
        reason: "validation_failure",
      }),
    );
    return outputFromDecision(input.run_input, {
      ...fallback,
      state_patch: {
        ...fallback.state_patch,
        validation_errors: validation.errors,
      },
    });
  }

  return outputFromDecision(input.run_input, decision);
}

export function safetyHandoffEmotionalRepairOutput(
  input: RunSkillInput,
): ConversationSkillOutput {
  const handoffRequest = {
    target_skill_id: "safety_crisis" as const,
    reason: "turn_frame_safety_risk_requires_safety_skill",
    confidence_band: "high" as const,
  };
  return baseOutput("emotional_repair", {
    status: "handoff",
    response_intent: "handoff_to_safety",
    handoff_request: handoffRequest,
    effects: conversationEffectsFromCandidates({
      handoff_request: handoffRequest,
    }),
    state_patch: {
      summary:
        "Safety risk present in turn frame; emotional repair did not answer.",
      phase: "exit",
      source_message_id: input.context.turn_frame.source_message_id,
    },
  });
}

export const EMOTIONAL_REPAIR_REDUCER_INVARIANTS = [
  "intake_failure_no_durable_effect",
  "intake_failure_no_skill_authored_business_reply",
  "memory_candidates_are_not_committed",
  "operation_suggestions_require_consent",
] as const;

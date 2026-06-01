import type {
  ConversationSkillEffectLedger,
  ConversationSkillOperationSuggestion,
} from "../../contracts/skill_output.v1.ts";
import type { MemoryWriteCandidate } from "../../contracts/memory_write_candidate.v1.ts";

export type StandardConversationSkillIntent =
  | "start"
  | "continue"
  | "clarify"
  | "explain"
  | "handoff"
  | "exit"
  | "off_topic"
  | "unclear";

export type StandardConversationSkillPhase =
  | "entry"
  | "understand"
  | "stabilize"
  | "reflect"
  | "next_step"
  | "exit";

export type StandardConversationSkillDecision = {
  skill_id: string;
  intent: StandardConversationSkillIntent;
  phase: StandardConversationSkillPhase;
  status: "continue" | "complete" | "exit" | "handoff" | "blocked";
  slots: Record<string, unknown>;
  missing_slots: string[];
  confidence: "low" | "medium" | "high";
  constraints: string[];
  response: {
    available: boolean;
    user_message: string | null;
  };
  effects: ConversationSkillEffectLedger;
  state_patch: Record<string, unknown>;
};

export type ConversationSkillEffectDraftInput = {
  operation_suggestions?: ConversationSkillOperationSuggestion[];
  memory_write_candidates?: MemoryWriteCandidate[];
  handoff_request?: unknown;
  intake_failed?: boolean;
  missing_slots?: string[];
};

export function emptyConversationEffects(): ConversationSkillEffectLedger {
  return {
    requested: [],
    allowed: [],
    blocked: [],
    committed: [],
  };
}

export function conversationEffectsFromCandidates(
  input: ConversationSkillEffectDraftInput,
): ConversationSkillEffectLedger {
  const effects = emptyConversationEffects();
  if (input.intake_failed) {
    effects.blocked.push({
      type: "durable_effect",
      reason_code: "structured_intake_failed",
    });
    return effects;
  }
  if ((input.missing_slots ?? []).length > 0) {
    effects.blocked.push({
      type: "durable_effect",
      reason_code: "missing_slots",
    });
  }
  for (const suggestion of input.operation_suggestions ?? []) {
    effects.requested.push({
      type: "operation_suggestion",
      operation_type: suggestion.operation_type,
      requires_user_consent: suggestion.requires_user_consent,
    });
    if (suggestion.requires_user_consent !== true) {
      effects.blocked.push({
        type: "operation_suggestion",
        reason_code: "user_consent_required",
      });
      continue;
    }
    effects.allowed.push({
      type: "operation_suggestion_candidate",
      operation_type: suggestion.operation_type,
      reason_code: "conversation_suggestion_only",
    });
  }
  for (const candidate of input.memory_write_candidates ?? []) {
    effects.requested.push({
      type: "memory_write_candidate",
      kind: candidate.kind,
      should_persist_default: candidate.should_persist_default,
    });
    effects.allowed.push({
      type: "memory_write_candidate",
      reason_code: "candidate_only_not_committed",
    });
  }
  if (input.handoff_request) {
    effects.requested.push({
      type: "handoff_request",
      request: input.handoff_request,
    });
    effects.allowed.push({
      type: "handoff_request",
      reason_code: "conversation_handoff_only",
    });
  }
  return effects;
}

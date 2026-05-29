import type { ConversationSkillOperationSuggestion } from "../../contracts/skill_output.v1.ts";

export type EmotionalRepairIntent =
  | "acute_self_attack"
  | "shame_or_guilt"
  | "anxiety_or_panic"
  | "relational_repair"
  | "emotion_lowered_action_blocked"
  | "asks_concrete_phrase"
  | "asks_regulation_without_potion"
  | "asks_recurring_support"
  | "status_or_meta_question"
  | "handoff_ready"
  | "unclear";

export type EmotionalRepairConstraint =
  | "no_potion"
  | "no_tool"
  | "no_plan"
  | "no_questions"
  | "one_question_max"
  | "concrete_before_question"
  | "short_reply"
  | "relationship_context"
  | "do_not_persist_identity_attack";

export type EmotionalRepairPhase =
  | "stabilize"
  | "de_shame"
  | "separate_fact_from_identity"
  | "repair_relationship"
  | "handoff_to_execution"
  | "exit";

export type EmotionalRepairDominance = "high" | "medium" | "low";

export type EmotionalRepairContextDomain =
  | "relationship"
  | "work"
  | "body"
  | "plan_execution"
  | "unknown";

export type EmotionalRepairResponseTone = "soft" | "grounded" | "direct_soft";

export type EmotionalRepairOperationSuggestion = {
  operation_type: "select_state_potion" | "create_recurring_reminder";
  reason: string;
  requires_user_consent: true;
  operation_input_hint?: Record<string, unknown>;
};

export type EmotionalRepairMemoryWriteCandidate = {
  source_text: string;
  should_persist_default: false;
  anti_identity_freeze_checked: true;
  sensitivity_level: 0 | 1 | 2 | 3 | 4;
  reason: string;
};

export type EmotionalRepairSkillDecision = {
  skill_id: "emotional_repair";
  intent: EmotionalRepairIntent;
  phase: EmotionalRepairPhase;
  emotional_dominance: EmotionalRepairDominance;
  context_domain: EmotionalRepairContextDomain;
  constraints: EmotionalRepairConstraint[];
  response_contract: {
    max_questions: 0 | 1;
    allow_plan: boolean;
    allow_tool_suggestion: boolean;
    allow_potion_suggestion: boolean;
    allow_concrete_action: boolean;
    tone: EmotionalRepairResponseTone;
  };
  handoff_request?: {
    target_skill_id: "execution_breakdown" | "safety_crisis";
    reason: string;
    confidence_band: "low" | "medium" | "high";
  };
  operation_suggestions?: EmotionalRepairOperationSuggestion[];
  memory_write_candidates?: EmotionalRepairMemoryWriteCandidate[];
  reply: string;
  state_patch: Record<string, unknown>;
};

export type EmotionalRepairDecisionValidation = {
  ok: boolean;
  errors: string[];
};

const INTENTS: readonly EmotionalRepairIntent[] = [
  "acute_self_attack",
  "shame_or_guilt",
  "anxiety_or_panic",
  "relational_repair",
  "emotion_lowered_action_blocked",
  "asks_concrete_phrase",
  "asks_regulation_without_potion",
  "asks_recurring_support",
  "status_or_meta_question",
  "handoff_ready",
  "unclear",
];

const PHASES: readonly EmotionalRepairPhase[] = [
  "stabilize",
  "de_shame",
  "separate_fact_from_identity",
  "repair_relationship",
  "handoff_to_execution",
  "exit",
];

const DOMINANCE: readonly EmotionalRepairDominance[] = [
  "high",
  "medium",
  "low",
];

const DOMAINS: readonly EmotionalRepairContextDomain[] = [
  "relationship",
  "work",
  "body",
  "plan_execution",
  "unknown",
];

const CONSTRAINTS: readonly EmotionalRepairConstraint[] = [
  "no_potion",
  "no_tool",
  "no_plan",
  "no_questions",
  "one_question_max",
  "concrete_before_question",
  "short_reply",
  "relationship_context",
  "do_not_persist_identity_attack",
];

const TONES: readonly EmotionalRepairResponseTone[] = [
  "soft",
  "grounded",
  "direct_soft",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  errors: string[],
): T | null {
  if (
    typeof value === "string" && (allowed as readonly string[]).includes(value)
  ) {
    return value as T;
  }
  errors.push(`invalid_${field}`);
  return null;
}

function enumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  errors: string[],
): T[] {
  if (!Array.isArray(value)) {
    errors.push(`invalid_${field}`);
    return [];
  }
  const out: T[] = [];
  for (const item of value) {
    if (
      typeof item === "string" && (allowed as readonly string[]).includes(item)
    ) {
      out.push(item as T);
    } else {
      errors.push(`invalid_${field}_item`);
    }
  }
  return [...new Set(out)];
}

function booleanValue(
  value: unknown,
  field: string,
  errors: string[],
): boolean {
  if (typeof value === "boolean") return value;
  errors.push(`invalid_${field}`);
  return false;
}

function stringValue(
  value: unknown,
  field: string,
  errors: string[],
): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  errors.push(`invalid_${field}`);
  return "";
}

function objectValue(
  value: unknown,
  field: string,
  errors: string[],
): Record<string, unknown> {
  if (isRecord(value)) return value;
  errors.push(`invalid_${field}`);
  return {};
}

export function normalizeEmotionalRepairDecision(
  raw: unknown,
): { decision: EmotionalRepairSkillDecision | null; errors: string[] } {
  const errors: string[] = [];
  const value = objectValue(raw, "decision", errors);
  const contract = objectValue(
    value.response_contract,
    "response_contract",
    errors,
  );
  const maxQuestions =
    contract.max_questions === 0 || contract.max_questions === 1
      ? contract.max_questions
      : null;
  if (maxQuestions === null) errors.push("invalid_max_questions");

  const handoffRaw = value.handoff_request;
  let handoff: EmotionalRepairSkillDecision["handoff_request"] | undefined;
  if (handoffRaw !== undefined && handoffRaw !== null) {
    const h = objectValue(handoffRaw, "handoff_request", errors);
    const target = enumValue(
      h.target_skill_id,
      ["execution_breakdown", "safety_crisis"] as const,
      "handoff_target_skill_id",
      errors,
    );
    const confidence = enumValue(
      h.confidence_band,
      ["low", "medium", "high"] as const,
      "handoff_confidence_band",
      errors,
    );
    if (target && confidence) {
      handoff = {
        target_skill_id: target,
        reason: stringValue(h.reason, "handoff_reason", errors),
        confidence_band: confidence,
      };
    }
  }

  const operationSuggestions: EmotionalRepairOperationSuggestion[] = [];
  if (value.operation_suggestions !== undefined) {
    if (!Array.isArray(value.operation_suggestions)) {
      errors.push("invalid_operation_suggestions");
    } else {
      for (const rawSuggestion of value.operation_suggestions) {
        const suggestion = objectValue(
          rawSuggestion,
          "operation_suggestion",
          errors,
        );
        const operationType = enumValue(
          suggestion.operation_type,
          ["select_state_potion", "create_recurring_reminder"] as const,
          "operation_type",
          errors,
        );
        if (!operationType) continue;
        if (suggestion.requires_user_consent !== true) {
          errors.push("operation_requires_user_consent_must_be_true");
        }
        const operationInputHint = isRecord(suggestion.operation_input_hint)
          ? suggestion.operation_input_hint
          : undefined;
        operationSuggestions.push({
          operation_type: operationType,
          reason: stringValue(suggestion.reason, "operation_reason", errors),
          requires_user_consent: true,
          ...(operationInputHint
            ? { operation_input_hint: operationInputHint }
            : {}),
        });
      }
    }
  }

  const memoryCandidates: EmotionalRepairMemoryWriteCandidate[] = [];
  if (value.memory_write_candidates !== undefined) {
    if (!Array.isArray(value.memory_write_candidates)) {
      errors.push("invalid_memory_write_candidates");
    } else {
      for (const rawCandidate of value.memory_write_candidates) {
        const candidate = objectValue(rawCandidate, "memory_candidate", errors);
        const sensitivity = [0, 1, 2, 3, 4].includes(
            Number(candidate.sensitivity_level),
          )
          ? Number(candidate.sensitivity_level) as 0 | 1 | 2 | 3 | 4
          : null;
        if (sensitivity === null) {
          errors.push("invalid_memory_sensitivity_level");
        }
        if (candidate.should_persist_default !== false) {
          errors.push("memory_should_persist_default_must_be_false");
        }
        if (candidate.anti_identity_freeze_checked !== true) {
          errors.push("memory_anti_identity_freeze_must_be_true");
        }
        if (sensitivity !== null) {
          memoryCandidates.push({
            source_text: stringValue(
              candidate.source_text,
              "memory_source_text",
              errors,
            ),
            should_persist_default: false,
            anti_identity_freeze_checked: true,
            sensitivity_level: sensitivity,
            reason: stringValue(candidate.reason, "memory_reason", errors),
          });
        }
      }
    }
  }

  const decision: EmotionalRepairSkillDecision = {
    skill_id: "emotional_repair",
    intent: enumValue(value.intent, INTENTS, "intent", errors) ?? "unclear",
    phase: enumValue(value.phase, PHASES, "phase", errors) ?? "exit",
    emotional_dominance: enumValue(
      value.emotional_dominance,
      DOMINANCE,
      "emotional_dominance",
      errors,
    ) ?? "medium",
    context_domain:
      enumValue(value.context_domain, DOMAINS, "context_domain", errors) ??
        "unknown",
    constraints: enumArray(
      value.constraints,
      CONSTRAINTS,
      "constraints",
      errors,
    ),
    response_contract: {
      max_questions: maxQuestions ?? 0,
      allow_plan: booleanValue(contract.allow_plan, "allow_plan", errors),
      allow_tool_suggestion: booleanValue(
        contract.allow_tool_suggestion,
        "allow_tool_suggestion",
        errors,
      ),
      allow_potion_suggestion: booleanValue(
        contract.allow_potion_suggestion,
        "allow_potion_suggestion",
        errors,
      ),
      allow_concrete_action: booleanValue(
        contract.allow_concrete_action,
        "allow_concrete_action",
        errors,
      ),
      tone: enumValue(contract.tone, TONES, "tone", errors) ?? "grounded",
    },
    ...(handoff ? { handoff_request: handoff } : {}),
    ...(operationSuggestions.length > 0
      ? { operation_suggestions: operationSuggestions }
      : {}),
    ...(memoryCandidates.length > 0
      ? { memory_write_candidates: memoryCandidates }
      : {}),
    reply: stringValue(value.reply, "reply", errors),
    state_patch: objectValue(value.state_patch, "state_patch", errors),
  };

  if (value.skill_id !== "emotional_repair") errors.push("invalid_skill_id");

  return { decision: errors.length === 0 ? decision : null, errors };
}

function countQuestions(reply: string): number {
  return (reply.match(/\?/g) ?? []).length;
}

function normalizedReply(reply: string): string {
  return reply.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function validateEmotionalRepairDecision(
  decision: EmotionalRepairSkillDecision,
): EmotionalRepairDecisionValidation {
  const errors: string[] = [];
  const reply = normalizedReply(decision.reply);
  const questionCount = countQuestions(decision.reply);
  if (questionCount > decision.response_contract.max_questions) {
    errors.push("reply_exceeds_question_budget");
  }
  if (
    !decision.response_contract.allow_plan &&
    /(^|\n)\s*(?:[-*•]|\d+[.)]|[ABCabc][.)])\s+\S/.test(decision.reply)
  ) {
    errors.push("reply_contains_plan_shape");
  }
  if (
    !decision.response_contract.allow_plan &&
    /\b(?:chrono|timer|plan|protocole|étape|etape|choix A\/B|A\/B)\b/i.test(
      decision.reply,
    )
  ) {
    errors.push("reply_contains_plan_wording");
  }
  if (
    !decision.response_contract.allow_potion_suggestion &&
    /\bpotion\b/i.test(decision.reply)
  ) {
    errors.push("reply_mentions_potion_when_forbidden");
  }
  if (
    [
      "c'est fait",
      "c est fait",
      "j'ai cree",
      "j ai cree",
      "j'ai programme",
      "j ai programme",
      "programme",
      "enregistre",
    ].some((fragment) => reply.includes(fragment))
  ) {
    errors.push("reply_claims_durable_effect");
  }
  if (
    decision.handoff_request?.target_skill_id === "execution_breakdown" &&
    decision.phase !== "handoff_to_execution"
  ) {
    errors.push("execution_handoff_requires_handoff_phase");
  }
  if (
    decision.constraints.includes("no_potion") &&
    decision.response_contract.allow_potion_suggestion
  ) {
    errors.push("no_potion_contract_allows_potion");
  }
  if (
    decision.constraints.includes("no_tool") &&
    decision.response_contract.allow_tool_suggestion
  ) {
    errors.push("no_tool_contract_allows_tool");
  }
  return { ok: errors.length === 0, errors };
}

export function applyEmotionalRepairInvariants(
  decision: EmotionalRepairSkillDecision,
): EmotionalRepairSkillDecision {
  const constraints = new Set(decision.constraints);
  const responseContract = { ...decision.response_contract };
  if (constraints.has("no_potion")) {
    responseContract.allow_potion_suggestion = false;
  }
  if (constraints.has("no_tool")) {
    responseContract.allow_tool_suggestion = false;
  }
  if (constraints.has("no_plan")) responseContract.allow_plan = false;
  if (constraints.has("no_questions")) responseContract.max_questions = 0;
  if (decision.emotional_dominance === "high") {
    responseContract.allow_plan = false;
    if (!responseContract.allow_tool_suggestion) {
      responseContract.allow_potion_suggestion = false;
    }
  }

  const allowTools = responseContract.allow_tool_suggestion;
  const allowPotion = allowTools && responseContract.allow_potion_suggestion;
  const operationSuggestions = (decision.operation_suggestions ?? []).filter(
    (suggestion) =>
      suggestion.requires_user_consent === true &&
      allowTools &&
      (suggestion.operation_type !== "select_state_potion" || allowPotion),
  );

  const memoryWriteCandidates = (decision.memory_write_candidates ?? []).map(
    (candidate) => ({
      ...candidate,
      should_persist_default: false as const,
      anti_identity_freeze_checked: true as const,
    }),
  );

  return {
    ...decision,
    constraints: [...constraints],
    response_contract: responseContract,
    operation_suggestions: operationSuggestions,
    memory_write_candidates: memoryWriteCandidates,
  };
}

export function toConversationOperationSuggestion(
  suggestion: EmotionalRepairOperationSuggestion,
): ConversationSkillOperationSuggestion {
  return {
    operation_type: suggestion.operation_type,
    reason: suggestion.reason,
    confidence_band: "medium",
    urgency: "medium",
    source_skill_id: "emotional_repair",
    operation_input_hint: suggestion.operation_input_hint,
    requires_user_consent: true,
  };
}

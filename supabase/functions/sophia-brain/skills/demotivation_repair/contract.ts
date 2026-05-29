import type {
  ConversationSkillOperationSuggestion,
  OperationSuggestionType,
} from "../../contracts/skill_output.v1.ts";
import type { MemoryWriteCandidate } from "../../contracts/memory_write_candidate.v1.ts";

export const DEMOTIVATION_REPAIR_SKILL_ID = "demotivation_repair" as const;

export type DemotivationRepairIntent =
  | "fatigue_drop"
  | "loss_of_meaning"
  | "failure_accumulation"
  | "avoidance_loop"
  | "overwhelm"
  | "concrete_action_emerged"
  | "asks_smaller_step"
  | "asks_no_tool_support"
  | "asks_recurring_support"
  | "status_or_meta_question"
  | "unclear";

export type DemotivationRepairConstraint =
  | "no_potion"
  | "no_tool"
  | "no_plan_edit"
  | "no_questions"
  | "one_question_max"
  | "concrete_before_question"
  | "short_reply"
  | "do_not_moralize"
  | "do_not_modify_plan_yet"
  | "prefer_smallest_action";

export type DemotivationRepairPhase =
  | "diagnose"
  | "reduce_friction"
  | "restore_meaning"
  | "stabilize_energy"
  | "handoff_to_execution"
  | "exit";

export type DemotivationRepairMotivationState =
  | "fatigue"
  | "loss_of_meaning"
  | "failure_accumulation"
  | "avoidance"
  | "overwhelm"
  | "unclear";

export type DemotivationRepairActionReadiness =
  | "none"
  | "hypothetical"
  | "ready"
  | "already_chosen";

export type DemotivationRepairResponseContract = {
  max_questions: 0 | 1;
  allow_plan_edit: boolean;
  allow_tool_suggestion: boolean;
  allow_potion_suggestion: boolean;
  allow_attack_card_suggestion: boolean;
  allow_concrete_action: boolean;
  tone: "grounded" | "soft_direct" | "energy_preserving";
};

export type DemotivationRepairOperationSuggestion = {
  operation_type:
    | "select_state_potion"
    | "prepare_attack_card"
    | "adjust_plan_item"
    | "create_recurring_reminder";
  reason: string;
  requires_user_consent: true;
  operation_input_hint?: Record<string, unknown>;
};

export type DemotivationRepairMemoryCandidate = {
  source_text: string;
  should_persist_default: false;
  anti_identity_freeze_checked: true;
  sensitivity_level: number;
  reason: string;
};

export type DemotivationRepairDecision = {
  skill_id: typeof DEMOTIVATION_REPAIR_SKILL_ID;
  intent: DemotivationRepairIntent;
  phase: DemotivationRepairPhase;
  motivation_state: DemotivationRepairMotivationState;
  action_readiness: DemotivationRepairActionReadiness;
  constraints: DemotivationRepairConstraint[];
  response_contract: DemotivationRepairResponseContract;
  handoff_request?: {
    target_skill_id: "execution_breakdown";
    reason: string;
    confidence_band: "low" | "medium" | "high";
  };
  operation_suggestions?: DemotivationRepairOperationSuggestion[];
  memory_write_candidates?: DemotivationRepairMemoryCandidate[];
  reply: string;
  state_patch: Record<string, unknown>;
};

export type DemotivationRepairIntakeResult =
  | { ok: true; decision: DemotivationRepairDecision }
  | { ok: false; reason: string; decision: DemotivationRepairDecision };

const INTENTS: readonly DemotivationRepairIntent[] = [
  "fatigue_drop",
  "loss_of_meaning",
  "failure_accumulation",
  "avoidance_loop",
  "overwhelm",
  "concrete_action_emerged",
  "asks_smaller_step",
  "asks_no_tool_support",
  "asks_recurring_support",
  "status_or_meta_question",
  "unclear",
];

const PHASES: readonly DemotivationRepairPhase[] = [
  "diagnose",
  "reduce_friction",
  "restore_meaning",
  "stabilize_energy",
  "handoff_to_execution",
  "exit",
];

const MOTIVATION_STATES: readonly DemotivationRepairMotivationState[] = [
  "fatigue",
  "loss_of_meaning",
  "failure_accumulation",
  "avoidance",
  "overwhelm",
  "unclear",
];

const ACTION_READINESS: readonly DemotivationRepairActionReadiness[] = [
  "none",
  "hypothetical",
  "ready",
  "already_chosen",
];

const CONSTRAINTS: readonly DemotivationRepairConstraint[] = [
  "no_potion",
  "no_tool",
  "no_plan_edit",
  "no_questions",
  "one_question_max",
  "concrete_before_question",
  "short_reply",
  "do_not_moralize",
  "do_not_modify_plan_yet",
  "prefer_smallest_action",
];

const TONES: readonly DemotivationRepairResponseContract["tone"][] = [
  "grounded",
  "soft_direct",
  "energy_preserving",
];

const ALLOWED_OPERATION_TYPES: readonly OperationSuggestionType[] = [
  "select_state_potion",
  "prepare_attack_card",
  "adjust_plan_item",
  "create_recurring_reminder",
];

const BANNED_REPLY_FRAGMENTS = [
  "il faut juste",
  "discipline-toi",
  "tu dois te forcer",
  "si tu voulais vraiment",
  "c'est fait",
  "créé",
  "cree",
  "programmé",
  "programme",
  "enregistré",
  "enregistre",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function uniqConstraints(
  constraints: unknown,
): DemotivationRepairConstraint[] {
  if (!Array.isArray(constraints)) return ["do_not_moralize"];
  const next: DemotivationRepairConstraint[] = [];
  for (const value of constraints) {
    if (CONSTRAINTS.includes(value as DemotivationRepairConstraint)) {
      const constraint = value as DemotivationRepairConstraint;
      if (!next.includes(constraint)) next.push(constraint);
    }
  }
  if (!next.includes("do_not_moralize")) next.push("do_not_moralize");
  return next;
}

function normalizeReply(reply: unknown, fallback: string): string {
  const value = typeof reply === "string" ? reply.trim() : "";
  if (!value) return fallback;
  const normalized = value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (
    BANNED_REPLY_FRAGMENTS.some((fragment) =>
      normalized.includes(
        fragment.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
      )
    )
  ) {
    return fallback;
  }
  return value;
}

function enforceQuestionLimit(
  reply: string,
  contract: DemotivationRepairResponseContract,
): string {
  const questionCount = [...reply].filter((char) => char === "?").length;
  if (contract.max_questions === 0 && questionCount > 0) {
    return "Je garde ça sans question: on baisse la friction, sans verdict sur toi, avec un seul geste minuscule.";
  }
  if (questionCount <= 1) return reply;
  return "Je garde une seule question: qu'est-ce qui pèse le plus là, l'énergie, le sens, ou la peur de répéter l'échec ?";
}

function clampQuestionContract(
  contract: DemotivationRepairResponseContract,
  constraints: DemotivationRepairConstraint[],
): DemotivationRepairResponseContract {
  const maxQuestions = constraints.includes("no_questions")
    ? 0
    : contract.max_questions === 0
    ? 0
    : 1;
  return {
    ...contract,
    max_questions: maxQuestions,
  };
}

function normalizeResponseContract(
  value: unknown,
): DemotivationRepairResponseContract {
  const record = isRecord(value) ? value : {};
  return {
    max_questions: record.max_questions === 0 ? 0 : 1,
    allow_plan_edit: record.allow_plan_edit === true,
    allow_tool_suggestion: record.allow_tool_suggestion !== false,
    allow_potion_suggestion: record.allow_potion_suggestion !== false,
    allow_attack_card_suggestion: record.allow_attack_card_suggestion === true,
    allow_concrete_action: record.allow_concrete_action !== false,
    tone: oneOf(record.tone, TONES, "energy_preserving"),
  };
}

function normalizeOperationSuggestions(
  value: unknown,
): DemotivationRepairOperationSuggestion[] {
  if (!Array.isArray(value)) return [];
  const suggestions: DemotivationRepairOperationSuggestion[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const operationType = item.operation_type;
    if (
      !ALLOWED_OPERATION_TYPES.includes(
        operationType as OperationSuggestionType,
      )
    ) {
      continue;
    }
    suggestions.push({
      operation_type: operationType as DemotivationRepairOperationSuggestion[
        "operation_type"
      ],
      reason: String(item.reason ?? "structured_demotivation_repair_decision"),
      requires_user_consent: true,
      operation_input_hint: isRecord(item.operation_input_hint)
        ? item.operation_input_hint
        : undefined,
    });
  }
  return suggestions;
}

function normalizeMemoryCandidates(
  value: unknown,
): DemotivationRepairMemoryCandidate[] {
  if (!Array.isArray(value)) return [];
  const candidates: DemotivationRepairMemoryCandidate[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const sourceText = String(item.source_text ?? "").trim();
    if (!sourceText) continue;
    candidates.push({
      source_text: sanitizeMemorySourceText(sourceText),
      should_persist_default: false,
      anti_identity_freeze_checked: true,
      sensitivity_level: typeof item.sensitivity_level === "number"
        ? Math.max(0, Math.min(4, Math.trunc(item.sensitivity_level)))
        : 2,
      reason: String(item.reason ?? "demotivation_repair_memory_candidate"),
    });
  }
  return candidates;
}

function normalizeHandoff(
  value: unknown,
): DemotivationRepairDecision["handoff_request"] | undefined {
  if (!isRecord(value)) return undefined;
  if (value.target_skill_id !== "execution_breakdown") return undefined;
  return {
    target_skill_id: "execution_breakdown",
    reason: String(value.reason ?? "concrete_action_ready"),
    confidence_band: oneOf(
      value.confidence_band,
      ["low", "medium", "high"],
      "medium",
    ),
  };
}

function applyDemotivationInvariants(
  decision: DemotivationRepairDecision,
): DemotivationRepairDecision {
  const constraints = uniqConstraints(decision.constraints);
  const responseContract = clampQuestionContract(
    normalizeResponseContract(decision.response_contract),
    constraints,
  );

  let suggestions = normalizeOperationSuggestions(
    decision.operation_suggestions,
  );
  if (
    constraints.includes("no_tool") ||
    responseContract.allow_tool_suggestion === false
  ) {
    suggestions = [];
  } else {
    suggestions = suggestions.filter((suggestion) => {
      if (
        suggestion.operation_type === "select_state_potion" &&
        (constraints.includes("no_potion") ||
          responseContract.allow_potion_suggestion === false)
      ) return false;
      if (
        suggestion.operation_type === "adjust_plan_item" &&
        (responseContract.allow_plan_edit === false ||
          constraints.includes("no_plan_edit") ||
          constraints.includes("do_not_modify_plan_yet"))
      ) return false;
      if (
        suggestion.operation_type === "prepare_attack_card" &&
        responseContract.allow_attack_card_suggestion === false
      ) return false;
      return true;
    });
  }

  const handoff = decision.action_readiness === "ready" ||
      decision.action_readiness === "already_chosen"
    ? normalizeHandoff(decision.handoff_request)
    : undefined;

  const reply = normalizeReply(
    decision.reply,
    "Je reste avec le décrochage lui-même: on garde ça petit, sans verdict sur toi, et on cherche juste le prochain point d'appui.",
  );

  return {
    ...decision,
    phase: handoff ? "handoff_to_execution" : decision.phase,
    constraints,
    response_contract: responseContract,
    handoff_request: handoff,
    operation_suggestions: suggestions,
    memory_write_candidates: normalizeMemoryCandidates(
      decision.memory_write_candidates,
    ),
    reply: enforceQuestionLimit(reply, responseContract),
    state_patch: isRecord(decision.state_patch) ? decision.state_patch : {},
  };
}

export function conservativeDemotivationRepairDecision(
  reason = "structured_intake_unavailable",
): DemotivationRepairDecision {
  return {
    skill_id: DEMOTIVATION_REPAIR_SKILL_ID,
    intent: "unclear",
    phase: "diagnose",
    motivation_state: "unclear",
    action_readiness: "none",
    constraints: [
      "do_not_moralize",
      "do_not_modify_plan_yet",
      "prefer_smallest_action",
      "one_question_max",
    ],
    response_contract: {
      max_questions: 1,
      allow_plan_edit: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: false,
      allow_attack_card_suggestion: false,
      allow_concrete_action: true,
      tone: "energy_preserving",
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    reply:
      "Je ne vais pas traiter ça comme un problème de discipline. On peut juste repérer ce qui pèse le plus là: énergie basse, perte de sens, ou peur de refaire le même scénario ?",
    state_patch: {
      summary:
        "Demotivation repair intake unavailable; conservative no-mutation state.",
      intake_status: "technical_fallback",
      reason,
    },
  };
}

export function normalizeDemotivationRepairDecision(
  value: unknown,
): DemotivationRepairDecision {
  if (!isRecord(value)) {
    return conservativeDemotivationRepairDecision("invalid_decision_shape");
  }
  const decision: DemotivationRepairDecision = {
    skill_id: DEMOTIVATION_REPAIR_SKILL_ID,
    intent: oneOf(value.intent, INTENTS, "unclear"),
    phase: oneOf(value.phase, PHASES, "diagnose"),
    motivation_state: oneOf(
      value.motivation_state,
      MOTIVATION_STATES,
      "unclear",
    ),
    action_readiness: oneOf(value.action_readiness, ACTION_READINESS, "none"),
    constraints: uniqConstraints(value.constraints),
    response_contract: normalizeResponseContract(value.response_contract),
    handoff_request: normalizeHandoff(value.handoff_request),
    operation_suggestions: normalizeOperationSuggestions(
      value.operation_suggestions,
    ),
    memory_write_candidates: normalizeMemoryCandidates(
      value.memory_write_candidates,
    ),
    reply: normalizeReply(
      value.reply,
      "Je reste avec le décrochage lui-même: on garde ça petit, sans verdict sur toi, et on cherche juste le prochain point d'appui.",
    ),
    state_patch: isRecord(value.state_patch) ? value.state_patch : {},
  };
  return applyDemotivationInvariants(decision);
}

export function toConversationOperationSuggestions(
  suggestions: DemotivationRepairOperationSuggestion[],
): ConversationSkillOperationSuggestion[] {
  return suggestions.map((suggestion) => ({
    operation_type: suggestion.operation_type,
    reason: suggestion.reason,
    confidence_band: "medium",
    urgency: "medium",
    source_skill_id: DEMOTIVATION_REPAIR_SKILL_ID,
    operation_input_hint: suggestion.operation_input_hint,
    requires_user_consent: true,
  }));
}

export function toMemoryWriteCandidates(
  candidates: DemotivationRepairMemoryCandidate[],
  sourceMessageId: string,
): MemoryWriteCandidate[] {
  return candidates.map((candidate) => {
    const text = sanitizeMemorySourceText(candidate.source_text);
    return {
      kind: "statement",
      content_text: text,
      evidence_source_ids: [sourceMessageId],
      confidence_band: "medium",
      sensitivity_level: Math.max(
        0,
        Math.min(4, Math.trunc(candidate.sensitivity_level)),
      ) as 0 | 1 | 2 | 3 | 4,
      persistence_rationale: candidate.reason,
      should_persist_default: false,
      anti_identity_freeze_checked: true,
      scope_hint: "session",
    };
  });
}

function sanitizeMemorySourceText(sourceText: string): string {
  const normalized = sourceText.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const identityFreezeFragments = [
    "je suis flemmard",
    "je suis un flemmard",
    "je n'ai aucune volonte",
    "je nai aucune volonte",
    "j'ai aucune volonte",
    "jai aucune volonte",
    "je rate toujours",
    "je suis incapable de tenir",
    "je suis incapable",
    "aucune volonte",
  ];
  if (
    identityFreezeFragments.some((fragment) => normalized.includes(fragment))
  ) {
    return "Episode de décrochage motivationnel dans le tour courant, à ne pas figer comme identité.";
  }
  return sourceText;
}

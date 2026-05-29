import type { MemoryWriteCandidate } from "../../contracts/memory_write_candidate.v1.ts";
import type {
  ConversationSkillOperationSuggestion,
  OperationSuggestionType,
} from "../../contracts/skill_output.v1.ts";

export const EXECUTION_BREAKDOWN_SKILL_ID = "execution_breakdown" as const;

export type ExecutionBreakdownIntent =
  | "target_resolution"
  | "diagnose_blocker"
  | "ask_first_step"
  | "asks_exact_phrase"
  | "asks_micro_action"
  | "action_too_large"
  | "recurrent_risk"
  | "relationship_repair_action"
  | "emotion_dominates"
  | "tool_request"
  | "status_or_meta_question"
  | "unclear";

export type ExecutionBlocker =
  | "flou"
  | "friction_demarrage"
  | "energie"
  | "peur"
  | "environnement"
  | "trop_grand"
  | "risque_rechute"
  | "relationnel"
  | "unknown";

export type ExecutionConstraint =
  | "no_tool"
  | "no_potion"
  | "no_questions"
  | "one_question_max"
  | "concrete_before_question"
  | "short_reply"
  | "exact_phrase_requested"
  | "do_not_edit_plan"
  | "do_not_create_card_without_consent";

export type ExecutionTarget = {
  kind: "plan_item" | "message" | "relationship" | "task" | "unknown";
  plan_item_id?: string;
  title?: string;
  raw_label?: string;
  confidence_band: "low" | "medium" | "high";
};

export type ExecutionResponseContract = {
  max_questions: 0 | 1;
  allow_tool_suggestion: boolean;
  allow_plan_edit_suggestion: boolean;
  allow_card_suggestion: boolean;
  allow_exact_phrase: boolean;
  must_start_with_concrete_action: boolean;
  max_bullets: 0 | 1 | 2 | 3;
  tone: "direct_soft" | "practical" | "relationship_repair";
};

export type ExecutionOperationSuggestion = {
  operation_type:
    | "prepare_attack_card"
    | "prepare_defense_card"
    | "adjust_plan_item";
  reason: string;
  requires_user_consent: true;
  operation_input_hint?: Record<string, unknown>;
};

export type ExecutionMemoryCandidate = {
  source_text: string;
  should_persist_default: false;
  anti_identity_freeze_checked: true;
  sensitivity_level: number;
  reason: string;
};

export type ExecutionDecision = {
  skill_id: typeof EXECUTION_BREAKDOWN_SKILL_ID;
  intent: ExecutionBreakdownIntent;
  phase:
    | "resolve_target"
    | "diagnose"
    | "give_micro_action"
    | "draft_phrase"
    | "suggest_tool"
    | "handoff_to_emotional_repair"
    | "exit";
  target?: ExecutionTarget;
  blocker: ExecutionBlocker;
  action_readiness:
    | "none"
    | "needs_first_step"
    | "ready"
    | "blocked_after_first_step";
  emotional_dominance: "high" | "medium" | "low";
  constraints: ExecutionConstraint[];
  response_contract: ExecutionResponseContract;
  handoff_request?: {
    target_skill_id: "emotional_repair";
    reason: string;
    confidence_band: "low" | "medium" | "high";
  };
  operation_suggestions?: ExecutionOperationSuggestion[];
  memory_write_candidates?: ExecutionMemoryCandidate[];
  reply: string;
  state_patch: Record<string, unknown>;
};

export type ExecutionIntakeResult =
  | { ok: true; decision: ExecutionDecision }
  | { ok: false; reason: string; decision: ExecutionDecision };

const INTENTS: readonly ExecutionBreakdownIntent[] = [
  "target_resolution",
  "diagnose_blocker",
  "ask_first_step",
  "asks_exact_phrase",
  "asks_micro_action",
  "action_too_large",
  "recurrent_risk",
  "relationship_repair_action",
  "emotion_dominates",
  "tool_request",
  "status_or_meta_question",
  "unclear",
];

const PHASES: readonly ExecutionDecision["phase"][] = [
  "resolve_target",
  "diagnose",
  "give_micro_action",
  "draft_phrase",
  "suggest_tool",
  "handoff_to_emotional_repair",
  "exit",
];

const BLOCKERS: readonly ExecutionBlocker[] = [
  "flou",
  "friction_demarrage",
  "energie",
  "peur",
  "environnement",
  "trop_grand",
  "risque_rechute",
  "relationnel",
  "unknown",
];

const READINESS: readonly ExecutionDecision["action_readiness"][] = [
  "none",
  "needs_first_step",
  "ready",
  "blocked_after_first_step",
];

const DOMINANCE: readonly ExecutionDecision["emotional_dominance"][] = [
  "high",
  "medium",
  "low",
];

const TARGET_KINDS: readonly ExecutionTarget["kind"][] = [
  "plan_item",
  "message",
  "relationship",
  "task",
  "unknown",
];

const CONSTRAINTS: readonly ExecutionConstraint[] = [
  "no_tool",
  "no_potion",
  "no_questions",
  "one_question_max",
  "concrete_before_question",
  "short_reply",
  "exact_phrase_requested",
  "do_not_edit_plan",
  "do_not_create_card_without_consent",
];

const TONES: readonly ExecutionResponseContract["tone"][] = [
  "direct_soft",
  "practical",
  "relationship_repair",
];

const ALLOWED_OPERATION_TYPES: readonly OperationSuggestionType[] = [
  "prepare_attack_card",
  "prepare_defense_card",
  "adjust_plan_item",
];

const DONE_LANGUAGE = [
  "c'est fait",
  "créé",
  "cree",
  "créée",
  "creee",
  "programmé",
  "programme",
  "programmée",
  "programmee",
  "enregistré",
  "enregistre",
  "enregistrée",
  "enregistree",
];

const CONCRETE_STARTS = [
  "Ouvre",
  "Pose",
  "Envoie",
  "Écris",
  "Ecris",
  "Mets",
  "Lance",
  "Prends",
  "Lis",
  "Réponds",
  "Reponds",
  "Note",
  "Choisis",
  "Ferme",
  "Déplace",
  "Deplace",
  "Colle",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  return allowed.includes(value as T)
    ? value as T
    : allowed[allowed.length - 1];
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return oneOf(value, ["low", "medium", "high"]);
}

function uniqConstraints(value: unknown): ExecutionConstraint[] {
  const next: ExecutionConstraint[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (CONSTRAINTS.includes(item as ExecutionConstraint)) {
        const constraint = item as ExecutionConstraint;
        if (!next.includes(constraint)) next.push(constraint);
      }
    }
  }
  if (!next.includes("do_not_create_card_without_consent")) {
    next.push("do_not_create_card_without_consent");
  }
  return next;
}

function normalizeTarget(value: unknown): ExecutionTarget {
  const record = isRecord(value) ? value : {};
  const kind = oneOf(record.kind, TARGET_KINDS);
  const planItemId = String(record.plan_item_id ?? "").trim();
  const title = String(record.title ?? "").trim();
  const rawLabel = String(record.raw_label ?? "").trim();
  return {
    kind,
    ...(planItemId ? { plan_item_id: planItemId } : {}),
    ...(title ? { title } : {}),
    ...(rawLabel ? { raw_label: rawLabel } : {}),
    confidence_band: confidence(record.confidence_band),
  };
}

function normalizeResponseContract(
  value: unknown,
): ExecutionResponseContract {
  const record = isRecord(value) ? value : {};
  const maxBullets = [0, 1, 2, 3].includes(Number(record.max_bullets))
    ? Number(record.max_bullets) as 0 | 1 | 2 | 3
    : 2;
  return {
    max_questions: record.max_questions === 0 ? 0 : 1,
    allow_tool_suggestion: record.allow_tool_suggestion !== false,
    allow_plan_edit_suggestion: record.allow_plan_edit_suggestion === true,
    allow_card_suggestion: record.allow_card_suggestion !== false,
    allow_exact_phrase: record.allow_exact_phrase === true,
    must_start_with_concrete_action:
      record.must_start_with_concrete_action === true,
    max_bullets: maxBullets,
    tone: oneOf(record.tone, TONES),
  };
}

function normalizeOperationSuggestions(
  value: unknown,
): ExecutionOperationSuggestion[] {
  if (!Array.isArray(value)) return [];
  const suggestions: ExecutionOperationSuggestion[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (
      !ALLOWED_OPERATION_TYPES.includes(
        item.operation_type as OperationSuggestionType,
      )
    ) continue;
    suggestions.push({
      operation_type: item.operation_type as ExecutionOperationSuggestion[
        "operation_type"
      ],
      reason: String(item.reason ?? "structured_execution_decision"),
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
): ExecutionMemoryCandidate[] {
  if (!Array.isArray(value)) return [];
  const candidates: ExecutionMemoryCandidate[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const sourceText = String(item.source_text ?? "").trim();
    if (!sourceText) continue;
    candidates.push({
      source_text: sourceText,
      should_persist_default: false,
      anti_identity_freeze_checked: true,
      sensitivity_level: typeof item.sensitivity_level === "number"
        ? Math.max(0, Math.min(4, Math.trunc(item.sensitivity_level)))
        : 1,
      reason: String(item.reason ?? "execution_breakdown_memory_candidate"),
    });
  }
  return candidates;
}

function normalizeHandoff(
  value: unknown,
): ExecutionDecision["handoff_request"] | undefined {
  if (!isRecord(value)) return undefined;
  if (value.target_skill_id !== "emotional_repair") return undefined;
  return {
    target_skill_id: "emotional_repair",
    reason: String(value.reason ?? "emotion_dominates_execution"),
    confidence_band: confidence(value.confidence_band),
  };
}

function normalizeForBannedText(value: string): string {
  let text = value.toLowerCase();
  const from = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿ";
  const to = "aaaaaaceeeeiiiinooooouuuuyy";
  for (let index = 0; index < from.length; index += 1) {
    text = text.split(from[index]).join(to[index]);
  }
  return text;
}

function questionCount(reply: string): number {
  return Math.max(0, reply.split("?").length - 1);
}

function bulletCount(reply: string): number {
  const lines = reply.split("\n").map((line) => line.trim());
  return lines.filter((line) =>
    line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")
  ).length;
}

function startsWithConcreteAction(reply: string): boolean {
  const text = reply.trim();
  if (!text) return false;
  if (text.startsWith('"') || text.startsWith("“") || text.startsWith("«")) {
    return true;
  }
  return CONCRETE_STARTS.some((start) => text.startsWith(start));
}

function exactPhrasePresent(reply: string): boolean {
  const text = reply.trim();
  return text.includes("«") || text.includes("“") || text.includes('"') ||
    text.includes("Tu peux envoyer");
}

function safeReplyFor(decision: ExecutionDecision): string {
  if (decision.phase === "handoff_to_emotional_repair") {
    return "On enlève d'abord le verdict contre toi. Ensuite seulement on découpe l'action.";
  }
  if (decision.intent === "asks_exact_phrase") {
    return "Tu peux envoyer: « Je suis désolé pour mon ton. Je veux réparer simplement, sans te mettre ça sur les épaules. »";
  }
  if (decision.target?.confidence_band === "low") {
    return "Quelle action précise bloque là, maintenant ?";
  }
  return "Ouvre juste l'endroit de l'action et fais une trace imparfaite de 2 minutes. Après, on ajuste.";
}

function sanitizeReply(
  decision: ExecutionDecision,
  contract: ExecutionResponseContract,
): string {
  const raw = String(decision.reply ?? "").trim();
  let reply = raw || safeReplyFor(decision);
  const normalized = normalizeForBannedText(reply);
  const banned = DONE_LANGUAGE.some((fragment) =>
    normalized.includes(normalizeForBannedText(fragment))
  );
  if (banned) reply = safeReplyFor(decision);
  if (
    contract.must_start_with_concrete_action && !startsWithConcreteAction(reply)
  ) {
    reply = safeReplyFor({
      ...decision,
      reply,
      phase: "give_micro_action",
    });
  }
  if (decision.intent === "asks_exact_phrase" && !exactPhrasePresent(reply)) {
    reply = safeReplyFor(decision);
  }
  if (questionCount(reply) > contract.max_questions) {
    reply = safeReplyFor({
      ...decision,
      reply,
      phase: contract.max_questions === 0
        ? "give_micro_action"
        : decision.phase,
    });
  }
  if (questionCount(reply) > contract.max_questions) {
    reply = reply.split("?").join(".");
  }
  if (bulletCount(reply) > contract.max_bullets) {
    const kept: string[] = [];
    let seen = 0;
    for (const line of reply.split("\n")) {
      const trimmed = line.trim();
      const bullet = trimmed.startsWith("- ") || trimmed.startsWith("* ") ||
        trimmed.startsWith("• ");
      if (bullet) {
        seen += 1;
        if (seen > contract.max_bullets) continue;
      }
      kept.push(line);
    }
    reply = kept.join("\n").trim();
  }
  return reply;
}

function enforceSuggestionContract(
  decision: ExecutionDecision,
  contract: ExecutionResponseContract,
  constraints: ExecutionConstraint[],
): ExecutionOperationSuggestion[] {
  const target = decision.target ?? {
    kind: "unknown",
    confidence_band: "low",
  } satisfies ExecutionTarget;
  let suggestions = normalizeOperationSuggestions(
    decision.operation_suggestions,
  );
  if (
    decision.intent === "asks_exact_phrase" ||
    decision.emotional_dominance === "high" ||
    target.confidence_band === "low" ||
    constraints.includes("no_tool") ||
    contract.allow_tool_suggestion === false
  ) {
    return [];
  }
  suggestions = suggestions.filter((suggestion) => {
    if (
      suggestion.operation_type === "adjust_plan_item" &&
      (constraints.includes("do_not_edit_plan") ||
        contract.allow_plan_edit_suggestion === false)
    ) return false;
    if (
      (suggestion.operation_type === "prepare_attack_card" ||
        suggestion.operation_type === "prepare_defense_card") &&
      contract.allow_card_suggestion === false
    ) return false;
    return true;
  });
  return suggestions.map((suggestion) => ({
    ...suggestion,
    requires_user_consent: true,
  }));
}

export function conservativeExecutionDecision(
  reason = "structured_intake_unavailable",
): ExecutionDecision {
  return {
    skill_id: EXECUTION_BREAKDOWN_SKILL_ID,
    intent: "unclear",
    phase: "resolve_target",
    target: { kind: "unknown", confidence_band: "low" },
    blocker: "unknown",
    action_readiness: "none",
    emotional_dominance: "low",
    constraints: [
      "one_question_max",
      "short_reply",
      "do_not_create_card_without_consent",
    ],
    response_contract: {
      max_questions: 1,
      allow_tool_suggestion: false,
      allow_plan_edit_suggestion: false,
      allow_card_suggestion: false,
      allow_exact_phrase: false,
      must_start_with_concrete_action: false,
      max_bullets: 0,
      tone: "direct_soft",
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    reply: "Quelle action précise bloque là, maintenant ?",
    state_patch: {
      summary:
        "Execution breakdown intake unavailable; conservative no-mutation state.",
      intake_status: "technical_fallback",
      reason,
    },
  };
}

export function applyExecutionInvariants(
  decision: ExecutionDecision,
): ExecutionDecision {
  const constraints = uniqConstraints(decision.constraints);
  let contract = normalizeResponseContract(decision.response_contract);
  if (constraints.includes("no_questions")) {
    contract = { ...contract, max_questions: 0 };
  } else if (constraints.includes("one_question_max")) {
    contract = {
      ...contract,
      max_questions: contract.max_questions === 0 ? 0 : 1,
    };
  }
  if (constraints.includes("concrete_before_question")) {
    contract = { ...contract, must_start_with_concrete_action: true };
  }
  if (constraints.includes("exact_phrase_requested")) {
    contract = { ...contract, allow_exact_phrase: true };
  }
  const target = normalizeTarget(decision.target);
  let handoff = normalizeHandoff(decision.handoff_request);
  let phase = decision.phase;
  if (decision.emotional_dominance === "high") {
    phase = "handoff_to_emotional_repair";
    handoff = handoff ?? {
      target_skill_id: "emotional_repair",
      reason: "emotion_dominates_execution",
      confidence_band: "high",
    };
  }
  if (
    target.confidence_band === "low" && phase !== "handoff_to_emotional_repair"
  ) {
    phase = "resolve_target";
  }
  const normalized: ExecutionDecision = {
    ...decision,
    skill_id: EXECUTION_BREAKDOWN_SKILL_ID,
    intent: oneOf(decision.intent, INTENTS),
    phase: oneOf(phase, PHASES),
    target,
    blocker: oneOf(decision.blocker, BLOCKERS),
    action_readiness: oneOf(decision.action_readiness, READINESS),
    emotional_dominance: oneOf(decision.emotional_dominance, DOMINANCE),
    constraints,
    response_contract: contract,
    handoff_request: handoff,
    operation_suggestions: normalizeOperationSuggestions(
      decision.operation_suggestions,
    ),
    memory_write_candidates: normalizeMemoryCandidates(
      decision.memory_write_candidates,
    ),
    reply: String(decision.reply ?? "").trim(),
    state_patch: isRecord(decision.state_patch) ? decision.state_patch : {},
  };
  const suggestions = enforceSuggestionContract(
    normalized,
    contract,
    constraints,
  );
  return {
    ...normalized,
    operation_suggestions: suggestions,
    reply: sanitizeReply(normalized, contract),
  };
}

export function normalizeExecutionDecision(value: unknown): ExecutionDecision {
  if (!isRecord(value)) {
    return conservativeExecutionDecision("invalid_decision_shape");
  }
  return applyExecutionInvariants({
    skill_id: EXECUTION_BREAKDOWN_SKILL_ID,
    intent: oneOf(value.intent, INTENTS),
    phase: oneOf(value.phase, PHASES),
    target: normalizeTarget(value.target),
    blocker: oneOf(value.blocker, BLOCKERS),
    action_readiness: oneOf(value.action_readiness, READINESS),
    emotional_dominance: oneOf(value.emotional_dominance, DOMINANCE),
    constraints: uniqConstraints(value.constraints),
    response_contract: normalizeResponseContract(value.response_contract),
    handoff_request: normalizeHandoff(value.handoff_request),
    operation_suggestions: normalizeOperationSuggestions(
      value.operation_suggestions,
    ),
    memory_write_candidates: normalizeMemoryCandidates(
      value.memory_write_candidates,
    ),
    reply: String(value.reply ?? "").trim(),
    state_patch: isRecord(value.state_patch) ? value.state_patch : {},
  });
}

export function toConversationOperationSuggestions(
  suggestions: ExecutionOperationSuggestion[],
): ConversationSkillOperationSuggestion[] {
  return suggestions.map((suggestion) => ({
    operation_type: suggestion.operation_type,
    reason: suggestion.reason,
    confidence_band: "medium",
    urgency: "medium",
    source_skill_id: EXECUTION_BREAKDOWN_SKILL_ID,
    operation_input_hint: suggestion.operation_input_hint,
    requires_user_consent: true,
  }));
}

export function toMemoryWriteCandidates(
  candidates: ExecutionMemoryCandidate[],
  sourceMessageId: string,
): MemoryWriteCandidate[] {
  return candidates.map((candidate) => ({
    kind: "statement",
    content_text: candidate.source_text,
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
  }));
}

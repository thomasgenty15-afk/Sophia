import type {
  ConfidenceBand,
  ConversationChannel,
  ConversationRisk,
  DispatcherMemoryPlan,
  DispatcherMemoryRetrievalPolicy,
  DispatcherMemoryTargetType,
  DispatcherResearchSignal,
  Explicitness,
  FlowOpportunity,
  RiskBand,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import {
  DOMAIN_KEYS_V1,
  DOMAIN_PREFIXES_V1,
} from "../../_shared/memory/domain_keys.ts";
import { ENTITY_TYPES } from "../../_shared/memory/types.v1.ts";
import type { SafetySignalContext } from "../safety/safety_context.ts";
import {
  buildDispatcherPrompt,
  DISPATCHER_V2_PROMPT_VERSION,
  DISPATCHER_V2_SYSTEM_PROMPT,
} from "./dispatcher.prompts.ts";
import {
  normalizeNoteInformation,
  type NoteInformation,
  type NoteInformationHandoffReason,
  type NoteInformationTargetDispatcher,
} from "../contracts/note_information.v1.ts";

export type DispatcherRunStats = {
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  prompt_version: typeof DISPATCHER_V2_PROMPT_VERSION;
  model_name: string;
  used_llm: boolean;
};

export type DispatcherLlmRunner = (input: {
  system_prompt: string;
  user_prompt: string;
  json_mode: true;
  model_name: string;
}) => Promise<unknown>;

export type RunDispatcherInput = {
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  user_id: string;
  channel: ConversationChannel;
  active_skill_state?: unknown;
  active_tool_skill_intake?: unknown;
  pending_tool_skill_confirmation?: unknown;
  active_topic_state?: unknown;
  flow_state_context?: unknown;
  plan_snapshot: unknown;
  safety_context_output: SafetySignalContext;
  conversation_risk_history?: number[];
  source_message_id?: string;
  turn_id?: string;
  llm_runner?: DispatcherLlmRunner;
  model_name?: string;
  on_stats?: (stats: DispatcherRunStats) => void;
};

type TurnFrameWithRouteHints = TurnFrame & {
  route_blocked_codes?: string[];
};

const RISK_ORDER: RiskBand[] = ["none", "low", "medium", "high", "critical"];

function riskMax(a: RiskBand, b: RiskBand): RiskBand {
  return RISK_ORDER[Math.max(RISK_ORDER.indexOf(a), RISK_ORDER.indexOf(b))] ??
    a;
}

function estimateTokens(text: string): number {
  return Math.ceil(String(text ?? "").length / 4);
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function confidence(high = true): ConfidenceBand {
  return high ? "high" : "medium";
}

const DEFAULT_MEMORY_PLAN: DispatcherMemoryPlan = {
  response_intent: "reflection",
  reasoning_complexity: "low",
  context_need: "minimal",
  memory_mode: "none",
  model_tier_hint: "lite",
  context_budget_tier: "tiny",
  targets: [],
  retrieval_policy: "semantic_first",
  plan_confidence: 0.7,
};

const DEFAULT_RESEARCH_SIGNAL: DispatcherResearchSignal = {
  detected: false,
  value: false,
  query: null,
  domain_hint: null,
  confidence: 0,
  reason: null,
};

const CONVERSATION_RISK_THRESHOLD = 8;

function clampConversationRiskScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

function recentConversationRiskScores(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map(clampConversationRiskScore)
    .slice(-5);
}

function evaluateConversationRisk(input: RunDispatcherInput): ConversationRisk {
  const previousScores = recentConversationRiskScores(
    input.conversation_risk_history,
  );
  return {
    score: 0,
    threshold: CONVERSATION_RISK_THRESHOLD,
    should_exit_flows: false,
    reason_codes: [],
    previous_scores: previousScores,
    matrix: [],
    context_summary: null,
    flow_exit_context: null,
  };
}

function confidenceRank(confidence: ConfidenceBand): number {
  return confidence === "critical"
    ? 4
    : confidence === "high"
    ? 3
    : confidence === "medium"
    ? 2
    : 1;
}

function explicitnessRank(explicitness: Explicitness): number {
  return explicitness === "explicit" ? 3 : explicitness === "implied" ? 2 : 1;
}

function selectDominantToolSkillIntent(
  intents: TurnFrame["tool_skill_intents"],
): TurnFrame["tool_skill_intents"] {
  if (intents.length <= 1) return intents;

  const withRejections = intents
    .map((intent, index) => ({ intent, index }))
    .filter(({ intent }) => (intent.rejected_operations ?? []).length > 0);
  if (withRejections.length > 0) {
    return [withRejections[withRejections.length - 1].intent];
  }

  const cardIntents = intents.filter((intent) =>
    intent.operation_type === "prepare_attack_card" ||
    intent.operation_type === "prepare_defense_card"
  );
  const cardOperationTypes = new Set(
    cardIntents.map((intent) => intent.operation_type),
  );
  if (
    cardOperationTypes.has("prepare_attack_card") &&
    cardOperationTypes.has("prepare_defense_card") &&
    cardIntents.length === intents.length
  ) {
    return intents;
  }

  const hasPlanAndCard =
    intents.some((intent) => intent.operation_type === "adjust_plan_item") &&
    intents.some((intent) =>
      intent.operation_type === "prepare_attack_card" ||
      intent.operation_type === "prepare_defense_card"
    );
  if (hasPlanAndCard) {
    const planIntents = intents
      .map((intent, index) => ({ intent, index }))
      .filter(({ intent }) => intent.operation_type === "adjust_plan_item");
    planIntents.sort((a, b) =>
      confidenceRank(b.intent.confidence_band) -
        confidenceRank(a.intent.confidence_band) ||
      explicitnessRank(b.intent.explicitness) -
        explicitnessRank(a.intent.explicitness) ||
      b.index - a.index
    );
    return [planIntents[0].intent];
  }

  const ranked = intents.map((intent, index) => ({ intent, index }));
  ranked.sort((a, b) =>
    confidenceRank(b.intent.confidence_band) -
      confidenceRank(a.intent.confidence_band) ||
    explicitnessRank(b.intent.explicitness) -
      explicitnessRank(a.intent.explicitness) ||
    b.index - a.index
  );
  return [ranked[0].intent];
}

function normalizePolicy(raw: unknown): DispatcherMemoryRetrievalPolicy {
  const value = String(raw ?? "").trim();
  return value === "force_taxonomy" || value === "taxonomy_first" ||
      value === "semantic_first" || value === "semantic_only"
    ? value
    : "semantic_first";
}

function normalizeMemoryMode(
  raw: unknown,
): DispatcherMemoryPlan["memory_mode"] {
  const value = String(raw ?? "").trim();
  return value === "light" || value === "broad" || value === "dossier" ||
      value === "none"
    ? value
    : "none";
}

function normalizeContextNeed(
  raw: unknown,
): DispatcherMemoryPlan["context_need"] {
  const value = String(raw ?? "").trim();
  return value === "targeted" || value === "broad" || value === "dossier" ||
      value === "minimal"
    ? value
    : "minimal";
}

function normalizeBudgetTier(
  raw: unknown,
): DispatcherMemoryPlan["context_budget_tier"] {
  const value = String(raw ?? "").trim();
  return value === "small" || value === "medium" || value === "large" ||
      value === "tiny"
    ? value
    : "tiny";
}

function normalizeReasoningComplexity(
  raw: unknown,
): DispatcherMemoryPlan["reasoning_complexity"] {
  const value = String(raw ?? "").trim();
  return value === "medium" || value === "high" ? value : "low";
}

function normalizeModelTier(
  raw: unknown,
): DispatcherMemoryPlan["model_tier_hint"] {
  const value = String(raw ?? "").trim();
  return value === "standard" || value === "deep" ? value : "lite";
}

function normalizeTargetType(raw: unknown): DispatcherMemoryTargetType | null {
  const value = String(raw ?? "").trim();
  return value === "topic" || value === "event" || value === "action" ||
      value === "level" || value === "entity" || value === "domain_key" ||
      value === "domain_prefix" || value === "runtime_snapshot"
    ? value
    : null;
}

function sanitizeMemoryTarget(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const target = raw as any;
  const type = normalizeTargetType(target.type);
  if (!type) return null;
  const key = String(target.key ?? target.entity_type ?? "").trim();
  const queryHint = String(target.query_hint ?? "").trim();
  if (!key && !queryHint) return null;
  if (type === "domain_key" && !DOMAIN_KEYS_V1.has(key)) return null;
  if (type === "domain_prefix" && !DOMAIN_PREFIXES_V1.has(key)) return null;
  const entityType = String(target.entity_type ?? key).trim();
  if (
    type === "entity" && entityType && !ENTITY_TYPES.includes(entityType as any)
  ) {
    return null;
  }
  const priorityRaw = String(target.priority ?? "").trim();
  const priority = priorityRaw === "low" || priorityRaw === "medium" ||
      priorityRaw === "high"
    ? priorityRaw
    : null;
  return {
    type,
    key: key || queryHint,
    query_hint: queryHint || null,
    expansion_policy: typeof target.expansion_policy === "string"
      ? target.expansion_policy
      : null,
    retrieval_policy: target.retrieval_policy
      ? normalizePolicy(target.retrieval_policy)
      : null,
    priority,
    entity_type: type === "entity" ? entityType || null : null,
  };
}

function sanitizeMemoryPlan(
  raw: unknown,
  fallback: DispatcherMemoryPlan,
): DispatcherMemoryPlan {
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as any;
  const targets = Array.isArray(candidate.targets)
    ? candidate.targets.map(sanitizeMemoryTarget).filter(Boolean)
    : fallback.targets;
  const memoryMode = normalizeMemoryMode(candidate.memory_mode);
  return {
    response_intent: String(
      candidate.response_intent ?? fallback.response_intent ?? "reflection",
    )
      .trim() || "reflection",
    reasoning_complexity: normalizeReasoningComplexity(
      candidate.reasoning_complexity ?? fallback.reasoning_complexity,
    ),
    context_need: normalizeContextNeed(candidate.context_need),
    memory_mode: memoryMode,
    model_tier_hint: normalizeModelTier(
      candidate.model_tier_hint ?? fallback.model_tier_hint,
    ),
    context_budget_tier: normalizeBudgetTier(candidate.context_budget_tier),
    targets: memoryMode === "none" ? [] : targets,
    retrieval_policy: normalizePolicy(
      candidate.retrieval_policy ?? fallback.retrieval_policy,
    ),
    plan_confidence: Math.max(
      0,
      Math.min(
        1,
        Number(candidate.plan_confidence ?? fallback.plan_confidence ?? 0.7),
      ),
    ),
  };
}

function activeReviewSkillId(input: RunDispatcherInput): string | null {
  const skillId = String((input.active_skill_state as any)?.skill_id ?? "")
    .trim();
  return skillId === "daily_action_review_v1" ||
      skillId === "weekly_adaptive_review_v1"
    ? skillId
    : null;
}

function suppressActionAndLevelMemoryDuringReview(
  plan: DispatcherMemoryPlan,
  input: RunDispatcherInput,
): DispatcherMemoryPlan {
  const skillId = activeReviewSkillId(input);
  if (!skillId) return plan;
  const targets = (plan.targets ?? []).filter((target) =>
    target.type !== "action" && target.type !== "level"
  );
  const nextMode = targets.length === 0 && plan.memory_mode === "light"
    ? "none"
    : plan.memory_mode;
  return {
    ...plan,
    memory_mode: nextMode,
    context_need: nextMode === "none" ? "minimal" : plan.context_need,
    context_budget_tier: nextMode === "none"
      ? "tiny"
      : plan.context_budget_tier,
    targets,
    plan_confidence: Math.min(plan.plan_confidence ?? 0.7, 0.75),
  };
}

function suppressReferencesDuringReview(
  input: RunDispatcherInput,
  actionReference: TurnFrame["action_reference"],
  levelReference: TurnFrame["level_reference"],
): {
  action_reference: TurnFrame["action_reference"];
  level_reference: TurnFrame["level_reference"];
} {
  if (!activeReviewSkillId(input)) {
    return {
      action_reference: actionReference,
      level_reference: levelReference,
    };
  }
  return {
    action_reference: {
      detected: false,
      status: "none",
      expansion_policy: "none",
      reason: "review_skill_owns_action_context",
    },
    level_reference: {
      detected: false,
      status: "none",
      expansion_policy: "none",
      reason: "review_skill_owns_level_context",
    },
  };
}

function suppressConcurrentRoutingDuringReview(
  input: RunDispatcherInput,
  turnFrame: TurnFrame,
): TurnFrame {
  if (!activeReviewSkillId(input)) {
    return turnFrame;
  }
  return {
    ...turnFrame,
    direct_effects: [],
    flow_opportunity: null,
  };
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function sanitizedOperationInputFromIntent(
  intent: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const explicitInput = objectRecord(intent.operation_input);
  if (explicitInput) return explicitInput;
  const payloadHint = objectRecord(intent.payload_hint);
  if (payloadHint) return undefined;
  const targetHint = String(intent.target_hint ?? "").trim();
  const evidence = Array.isArray(intent.evidence)
    ? intent.evidence.map((item) => String(item).trim()).filter(Boolean).slice(
      0,
      4,
    )
    : [];
  if (!targetHint && evidence.length === 0) return undefined;
  return {
    ...(targetHint ? { target_hint: targetHint } : {}),
    ...(evidence.length > 0 ? { evidence } : {}),
  };
}

function sanitizeToolSkillIntent(
  raw: unknown,
): TurnFrame["tool_skill_intents"][number] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const intent = raw as any;
  const operationType = String(intent.operation_type ?? "").trim();
  if (!operationType) return null;
  const explicitnessRaw = String(intent.explicitness ?? "").trim();
  const explicitness: TurnFrame["tool_skill_intents"][number]["explicitness"] =
    explicitnessRaw === "explicit" || explicitnessRaw === "implied" ||
      explicitnessRaw === "weak"
      ? explicitnessRaw
      : "explicit";
  const confidenceRaw = String(intent.confidence_band ?? "").trim();
  const confidenceBand:
    TurnFrame["tool_skill_intents"][number]["confidence_band"] =
      confidenceRaw === "low" || confidenceRaw === "medium" ||
        confidenceRaw === "high" || confidenceRaw === "critical"
        ? confidenceRaw
        : "low";
  const ambiguityRaw = String(intent.ambiguity ?? "").trim();
  const ambiguity: TurnFrame["tool_skill_intents"][number]["ambiguity"] =
    ambiguityRaw === "none" || ambiguityRaw === "target_ambiguous" ||
      ambiguityRaw === "intent_ambiguous" || ambiguityRaw === "both"
      ? ambiguityRaw
      : "none";
  const userIntentRaw = String(intent.user_intent ?? "").trim();
  const userIntent: TurnFrame["tool_skill_intents"][number]["user_intent"] =
    userIntentRaw === "create" || userIntentRaw === "update" ||
      userIntentRaw === "adjust" || userIntentRaw === "select" ||
      userIntentRaw === "explain_only" || userIntentRaw === "none"
      ? userIntentRaw
      : operationType === "adjust_plan_item"
      ? "adjust"
      : operationType === "select_state_potion"
      ? "select"
      : "create";
  const adjustPlanScopeRaw = String(intent.adjust_plan_scope ?? "").trim();
  const adjustPlanScope = adjustPlanScopeRaw === "specific_action" ||
      adjustPlanScopeRaw === "current_level" ||
      adjustPlanScopeRaw === "whole_plan"
    ? adjustPlanScopeRaw
    : undefined;
  const rejectedOperations = Array.isArray(intent.rejected_operations)
    ? intent.rejected_operations.map((item: unknown) => String(item).trim())
      .filter(Boolean)
    : undefined;
  const score = optionalScore(intent.score);
  return {
    operation_type: operationType,
    explicitness,
    target_hint: String(intent.target_hint ?? "").trim() || undefined,
    operation_input: sanitizedOperationInputFromIntent(intent),
    payload_hint: objectRecord(intent.payload_hint),
    adjust_plan_scope: adjustPlanScope,
    rejected_operations: rejectedOperations,
    confidence_band: confidenceBand,
    ...(score !== undefined ? { score } : {}),
    ambiguity,
    user_intent: userIntent,
  };
}

function sanitizeActiveHandoffAction(
  raw: unknown,
): TurnFrame["active_handoff_action"] {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
  if (!record) return null;
  const type = String(record.type ?? "").trim();
  if (
    type !== "handoff_apply_attempt" &&
    type !== "repeat_handoff" &&
    type !== "platform_destination_followup" &&
    type !== "revise_handoff" &&
    type !== "field_confirmation" &&
    type !== "cancel_handoff" &&
    type !== "clarify_handoff" &&
    type !== "topic_change"
  ) return null;
  const confidenceRaw = String(record.confidence ?? "low").trim();
  const confidence = confidenceRaw === "high" || confidenceRaw === "medium"
    ? confidenceRaw
    : "low";
  const evidence = Array.isArray(record.evidence)
    ? record.evidence.map((item) => String(item).trim()).filter(Boolean).slice(
      0,
      4,
    )
    : [];
  const targetSkillId = typeof record.target_skill_id === "string"
    ? record.target_skill_id.trim()
    : null;
  return {
    type,
    confidence,
    evidence,
    target_skill_id: targetSkillId || null,
  };
}

function addBlockedCode(turnFrame: TurnFrame, code: string): void {
  const withHints = turnFrame as TurnFrameWithRouteHints;
  withHints.route_blocked_codes = [
    ...new Set([...(withHints.route_blocked_codes ?? []), code]),
  ];
}

function clamp01(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function optionalScore(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return clamp01(value);
}

function sanitizeResearchSignal(
  raw: unknown,
  fallback: DispatcherResearchSignal,
  fallbackQuery: string,
): DispatcherResearchSignal {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const signal = raw as Record<string, unknown>;
  const explicitValue = typeof signal.value === "boolean";
  const confidenceRaw = clamp01(
    signal.confidence,
    signal.detected === true ? 0.7 : 0,
  );
  const value = explicitValue
    ? signal.value === true
    : signal.detected === true && confidenceRaw >= 0.55;
  const detected = signal.detected === true || value;
  const confidence = confidenceRaw;
  const query = String(signal.query ?? "").trim() ||
    (value ? fallbackQuery.trim() : "");
  const domainHint = String(signal.domain_hint ?? "").trim();
  const reason = String(signal.reason ?? "").trim();
  if (!detected && !value) return DEFAULT_RESEARCH_SIGNAL;
  return {
    detected,
    value,
    query: query ? query.slice(0, 180) : null,
    domain_hint: domainHint ? domainHint.slice(0, 30) : null,
    confidence,
    reason: reason ? reason.slice(0, 120) : null,
  };
}

function sanitizeFlowOpportunity(raw: unknown): FlowOpportunity | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const targetKind = record.target_kind;
  const targetFlow = record.target_flow;
  const confidence = record.confidence;
  if (
    (targetKind !== "skill" && targetKind !== "tool_skill" &&
      targetKind !== "direct_effect") ||
    typeof targetFlow !== "string" ||
    (confidence !== "low" && confidence !== "medium" &&
      confidence !== "high")
  ) {
    return null;
  }
  const score = optionalScore(record.score);
  return {
    opportunity_id: typeof record.opportunity_id === "string"
      ? record.opportunity_id
      : `${targetFlow}.opportunity`,
    target_kind: targetKind,
    target_flow: targetFlow as FlowOpportunity["target_flow"],
    confidence,
    ...(score !== undefined ? { score } : {}),
    priority: Number.isFinite(Number(record.priority))
      ? Number(record.priority)
      : 50,
    reason: typeof record.reason === "string" ? record.reason : "opportunity",
    evidence: Array.isArray(record.evidence)
      ? record.evidence.map(String).slice(0, 8)
      : [],
    seed_context: record.seed_context &&
        typeof record.seed_context === "object" &&
        !Array.isArray(record.seed_context)
      ? record.seed_context as Record<string, unknown>
      : {},
  };
}

function sanitizeSkillSignal(raw: unknown): {
  detected: boolean;
  confidence_band: ConfidenceBand;
  score?: number;
  reason?: string;
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const signal = raw as Record<string, unknown>;
  const confidenceRaw = String(signal.confidence_band ?? "").trim();
  const confidenceBand: ConfidenceBand = confidenceRaw === "low" ||
      confidenceRaw === "medium" || confidenceRaw === "high" ||
      confidenceRaw === "critical"
    ? confidenceRaw
    : "low";
  const score = optionalScore(signal.score);
  const reason = String(signal.reason ?? "").trim();
  return {
    detected: signal.detected === true,
    confidence_band: confidenceBand,
    ...(score !== undefined ? { score } : {}),
    ...(reason ? { reason } : {}),
  };
}

function sanitizeSkillSignalGroup(raw: unknown): Record<
  string,
  NonNullable<
    NonNullable<TurnFrame["skill_signals"]["entry"]>[string]
  >
> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries: Record<
    string,
    NonNullable<
      NonNullable<TurnFrame["skill_signals"]["entry"]>[string]
    >
  > = {};
  for (const [key, value] of Object.entries(raw)) {
    const skillId = String(key ?? "").trim();
    if (!skillId) continue;
    const signal = sanitizeSkillSignal(value);
    if (signal) entries[skillId] = signal as any;
  }
  return entries;
}

function sanitizeSkillSignals(
  raw: unknown,
): NonNullable<TurnFrame["skill_signals"]> {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    entry: sanitizeSkillSignalGroup(root.entry),
    lifecycle: sanitizeSkillSignalGroup(root.lifecycle),
    exit: sanitizeSkillSignalGroup(root.exit),
  };
}

function firstDetectedSkillSignalKey(
  group: Record<string, unknown> | undefined,
): string | null {
  if (!group || typeof group !== "object") return null;
  for (const [key, value] of Object.entries(group)) {
    if (
      value && typeof value === "object" && !Array.isArray(value) &&
      (value as Record<string, unknown>).detected === true
    ) {
      return key;
    }
  }
  return null;
}

function noteFallbackTargetDispatcher(args: {
  safetyBlocksToolSkills: boolean;
  routedOperationIntents: TurnFrame["tool_skill_intents"];
  raw: Record<string, unknown> | null;
  skillSignals: NonNullable<TurnFrame["skill_signals"]>;
  needsResearch: DispatcherResearchSignal;
}): NoteInformationTargetDispatcher {
  if (args.safetyBlocksToolSkills) return "safety_crisis";
  const operationType = args.routedOperationIntents[0]?.operation_type;
  if (operationType) return operationType as NoteInformationTargetDispatcher;
  const directEffects = Array.isArray(args.raw?.direct_effects)
    ? args.raw?.direct_effects as Array<Record<string, unknown>>
    : [];
  const effectType = String(directEffects[0]?.effect_type ?? "").trim();
  if (effectType) return effectType as NoteInformationTargetDispatcher;
  if (
    args.raw?.flow_opportunity && typeof args.raw.flow_opportunity === "object"
  ) {
    return "verification_opportunities";
  }
  const skillKey = firstDetectedSkillSignalKey(args.skillSignals.entry) ??
    firstDetectedSkillSignalKey(args.skillSignals.lifecycle) ??
    firstDetectedSkillSignalKey(args.skillSignals.exit);
  if (skillKey) return skillKey as NoteInformationTargetDispatcher;
  if (args.needsResearch.value) return "global";
  return "other_local";
}

function noteFallbackHandoffReason(args: {
  safetyBlocksToolSkills: boolean;
  raw: Record<string, unknown> | null;
}): NoteInformationHandoffReason {
  if (args.safetyBlocksToolSkills) return "safety";
  if (
    args.raw?.flow_opportunity && typeof args.raw.flow_opportunity === "object"
  ) {
    return "bridge";
  }
  return "explicit_user_request";
}

function normalizeDispatcherNoteInformation(args: {
  rawNoteInformation: Record<string, unknown> | null;
  input: RunDispatcherInput;
  safetyBlocksToolSkills: boolean;
  routedOperationIntents: TurnFrame["tool_skill_intents"];
  raw: Record<string, unknown> | null;
  skillSignals: NonNullable<TurnFrame["skill_signals"]>;
  needsResearch: DispatcherResearchSignal;
}): NoteInformation {
  const targetDispatcher = noteFallbackTargetDispatcher({
    safetyBlocksToolSkills: args.safetyBlocksToolSkills,
    routedOperationIntents: args.routedOperationIntents,
    raw: args.raw,
    skillSignals: args.skillSignals,
    needsResearch: args.needsResearch,
  });
  const handoffReason = noteFallbackHandoffReason({
    safetyBlocksToolSkills: args.safetyBlocksToolSkills,
    raw: args.raw,
  });
  return normalizeNoteInformation(args.rawNoteInformation, {
    source_flow_id: "global_dispatcher",
    handoff_reason: handoffReason,
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher:
      `User message produced a non-normal routing signal for ${targetDispatcher}. Use structured_context and evidence; do not reinterpret as normal conversation unless the current message clearly contradicts the signal.`,
    user_words: [args.input.user_message.slice(0, 240)],
    structured_context: {
      user_message_summary: args.input.user_message.slice(0, 240),
      active_flow_summary:
        `Global dispatcher selected target=${targetDispatcher}.`,
      target_dispatcher: targetDispatcher,
      routed_operation_types: args.routedOperationIntents.map((intent) =>
        intent.operation_type
      ),
      flow_opportunity: args.raw?.flow_opportunity ?? null,
      skill_signal_entry_keys: Object.keys(args.skillSignals.entry ?? {}),
      skill_signal_lifecycle_keys: Object.keys(
        args.skillSignals.lifecycle ?? {},
      ),
      skill_signal_exit_keys: Object.keys(args.skillSignals.exit ?? {}),
      needs_research: args.needsResearch.value,
    },
    confidence: "medium",
  });
}

function neutralTurnFrame(input: RunDispatcherInput): TurnFrame {
  const safetyRisk = input.safety_context_output.risk_band;
  const conversationRisk = evaluateConversationRisk(input);
  const turnFrame: TurnFrame = {
    turn_id: input.turn_id ?? crypto.randomUUID(),
    source_message_id: input.source_message_id ?? crypto.randomUUID(),
    user_id: input.user_id,
    channel: input.channel,
    safety: {
      risk_band: safetyRisk,
      reason_codes: [...input.safety_context_output.reason_codes],
      evidence: [...input.safety_context_output.evidence],
    },
    conversation_risk: conversationRisk,
    direct_effects: [],
    tool_skill_intents: [],
    flow_opportunity: null,
    note_information: null,
    skill_signals: {},
    needs_research: DEFAULT_RESEARCH_SIGNAL,
    action_reference: {
      detected: false,
      status: "none",
      expansion_policy: "none",
      reason: "semantic_inference_unavailable",
    },
    level_reference: {
      detected: false,
      status: "none",
      expansion_policy: "none",
      reason: "semantic_inference_unavailable",
    },
    memory_plan: DEFAULT_MEMORY_PLAN,
  };

  if (input.active_skill_state && (input.active_skill_state as any)?.skill_id) {
    const skillId = String((input.active_skill_state as any).skill_id);
    turnFrame.skill_signals.lifecycle = {
      [skillId]: {
        detected: true,
        confidence_band: "high",
        reason: "active_skill_continue",
      },
    };
  }

  const safetyBlocksToolSkills = safetyRisk === "high" ||
    safetyRisk === "critical";
  if (safetyBlocksToolSkills) {
    turnFrame.direct_effects = [];
    turnFrame.tool_skill_intents = [];
    turnFrame.flow_opportunity = null;
    turnFrame.skill_signals = {};
  }

  return suppressConcurrentRoutingDuringReview(input, turnFrame);
}

function sanitizeLlmTurnFrame(
  candidate: unknown,
  input: RunDispatcherInput,
): TurnFrame {
  const baseline = neutralTurnFrame(input);
  const raw = candidate && typeof candidate === "object"
    ? candidate as any
    : {};
  const rawToolSkillIntents = Array.isArray(raw?.tool_skill_intents)
    ? raw.tool_skill_intents
    : [];
  const reviewSkillActive = Boolean(activeReviewSkillId(input));
  const operationIntents = rawToolSkillIntents
    .map(sanitizeToolSkillIntent)
    .filter(
      (intent: ReturnType<typeof sanitizeToolSkillIntent>): intent is TurnFrame[
        "tool_skill_intents"
      ][number] => {
        return Boolean(intent);
      },
    );
  const dominantOperationIntents = selectDominantToolSkillIntent(
    operationIntents,
  );
  const routedOperationIntents = reviewSkillActive
    ? dominantOperationIntents.filter((
      intent: TurnFrame["tool_skill_intents"][number],
    ) =>
      intent.explicitness === "explicit" &&
      (intent.confidence_band === "high" ||
        intent.confidence_band === "critical") &&
      intent.ambiguity === "none" &&
      intent.user_intent !== "explain_only"
    )
    : dominantOperationIntents;
  const safetyRisk = riskMax(
    input.safety_context_output.risk_band,
    raw?.safety?.risk_band ?? baseline.safety.risk_band,
  );
  const rawSkillSignals = sanitizeSkillSignals(raw?.skill_signals);
  const shouldSuppressProductHelpForExplicitOperation =
    rawSkillSignals.entry?.product_help?.detected === true &&
    operationIntents.some((intent: TurnFrame["tool_skill_intents"][number]) =>
      intent.explicitness === "explicit" &&
      (intent.confidence_band === "high" ||
        intent.confidence_band === "critical") &&
      intent.user_intent !== "explain_only"
    );
  const skillSignals = shouldSuppressProductHelpForExplicitOperation
    ? (() => {
      const entry = { ...(rawSkillSignals.entry ?? {}) };
      delete entry.product_help;
      return { ...rawSkillSignals, entry };
    })()
    : rawSkillSignals;
  const baselineConversationRisk = baseline.conversation_risk ??
    evaluateConversationRisk(input);
  const safetyBlocksToolSkills = safetyRisk === "high" ||
    safetyRisk === "critical";
  const finalRoutedOperationIntents = safetyBlocksToolSkills
    ? []
    : routedOperationIntents;
  const rawNoteInformation =
    raw?.note_information && typeof raw.note_information === "object" &&
      !Array.isArray(raw.note_information)
      ? raw.note_information
      : null;
  const needsResearch = sanitizeResearchSignal(
    raw?.needs_research,
    baseline.needs_research ?? DEFAULT_RESEARCH_SIGNAL,
    input.user_message,
  );
  const hasRawNonNormalSignal = safetyBlocksToolSkills ||
    finalRoutedOperationIntents.length > 0 ||
    (Array.isArray(raw?.direct_effects) && raw.direct_effects.length > 0) ||
    (raw?.flow_opportunity && typeof raw.flow_opportunity === "object") ||
    (raw?.active_handoff_action &&
      typeof raw.active_handoff_action === "object") ||
    (raw?.confirmation_response &&
      typeof raw.confirmation_response === "object") ||
    needsResearch.value === true ||
    Object.values(skillSignals.entry ?? {}).some((signal: any) =>
      signal?.detected === true
    ) ||
    Object.values(skillSignals.lifecycle ?? {}).some((signal: any) =>
      signal?.detected === true
    ) ||
    Object.values(skillSignals.exit ?? {}).some((signal: any) =>
      signal?.detected === true
    );
  const normalizedNoteInformation = hasRawNonNormalSignal
    ? normalizeDispatcherNoteInformation({
      rawNoteInformation,
      input,
      safetyBlocksToolSkills,
      routedOperationIntents: finalRoutedOperationIntents,
      raw,
      skillSignals,
      needsResearch,
    })
    : null;
  const safeRaw = { ...raw };
  delete safeRaw[["tool", "skill", "opportunity"].join("_")];
  const normalReplyFitScore = optionalScore(raw?.normal_reply_fit_score);
  const normalReplyFitEvidence = Array.isArray(raw?.normal_reply_fit_evidence)
    ? raw.normal_reply_fit_evidence.map(String).slice(0, 8)
    : undefined;
  return {
    ...baseline,
    ...safeRaw,
    user_id: input.user_id,
    channel: input.channel,
    safety: {
      risk_band: safetyRisk,
      reason_codes: Array.isArray(raw?.safety?.reason_codes)
        ? raw.safety.reason_codes.map(String)
        : baseline.safety.reason_codes,
      evidence: Array.isArray(raw?.safety?.evidence)
        ? raw.safety.evidence.map(String)
        : baseline.safety.evidence,
    },
    conversation_risk: baselineConversationRisk,
    ...(normalReplyFitScore !== undefined
      ? { normal_reply_fit_score: normalReplyFitScore }
      : {}),
    ...(normalReplyFitEvidence !== undefined
      ? { normal_reply_fit_evidence: normalReplyFitEvidence }
      : {}),
    direct_effects: safetyBlocksToolSkills || reviewSkillActive
      ? []
      : Array.isArray(raw?.direct_effects)
      ? raw.direct_effects
      : [],
    tool_skill_intents: finalRoutedOperationIntents,
    flow_opportunity: safetyBlocksToolSkills
      ? null
      : sanitizeFlowOpportunity(raw?.flow_opportunity),
    note_information: normalizedNoteInformation,
    skill_signals: safetyBlocksToolSkills ? {} : skillSignals,
    active_handoff_action: safetyBlocksToolSkills
      ? null
      : sanitizeActiveHandoffAction(raw?.active_handoff_action),
    needs_research: needsResearch,
    action_reference: baseline.action_reference,
    level_reference: baseline.level_reference,
    memory_plan: suppressActionAndLevelMemoryDuringReview(
      sanitizeMemoryPlan(raw?.memory_plan, baseline.memory_plan),
      input,
    ),
  };
}

function normalizeCoverageText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function directEffectSignature(effect: TurnFrame["direct_effects"][number]) {
  return `${String(effect.effect_type ?? "")}:${
    String(effect.target_status ?? "")
  }:${String(effect.confidence_band ?? "")}`;
}

function hasAllOriginalDirectEffects(
  original: TurnFrame,
  repaired: TurnFrame,
): boolean {
  const repairedSignatures = new Set(repaired.direct_effects.map(
    directEffectSignature,
  ));
  return original.direct_effects.every((effect) =>
    repairedSignatures.has(directEffectSignature(effect))
  );
}

function hasEntrySkillSignal(frame: TurnFrame): boolean {
  const entry = frame.skill_signals?.entry;
  return Boolean(
    entry && typeof entry === "object" &&
      Object.values(entry).some((value) =>
        value && typeof value === "object" &&
        (value as { detected?: unknown }).detected !== false
      ),
  );
}

function hasAdditionalStructuredSignal(
  original: TurnFrame,
  repaired: TurnFrame,
): boolean {
  if (repaired.tool_skill_intents.length > original.tool_skill_intents.length) {
    return true;
  }
  return !hasEntrySkillSignal(original) && hasEntrySkillSignal(repaired);
}

function needsCompositeIntentRepair(
  frame: TurnFrame,
  input: RunDispatcherInput,
): boolean {
  if (
    frame.safety.risk_band === "high" || frame.safety.risk_band === "critical"
  ) {
    return false;
  }
  if (frame.conversation_risk?.should_exit_flows) return false;
  if (frame.direct_effects.length === 0) return false;
  if (frame.tool_skill_intents.length > 0) return false;
  if (hasEntrySkillSignal(frame)) return false;

  const message = normalizeCoverageText(input.user_message);
  if (message.length < 40) return false;

  return frame.direct_effects.some((effect) => {
    const hint = effect.payload_hint && typeof effect.payload_hint === "object"
      ? (effect.payload_hint as Record<string, unknown>).raw_text
      : null;
    const covered = normalizeCoverageText(hint);
    return covered.length >= 12 &&
      covered.length < message.length * 0.82 &&
      message.includes(covered);
  });
}

function buildCompositeIntentRepairPrompt(args: {
  input: RunDispatcherInput;
  previous: TurnFrame;
}): string {
  const coveredTexts = args.previous.direct_effects
    .map((effect) => {
      const hint =
        effect.payload_hint && typeof effect.payload_hint === "object"
          ? (effect.payload_hint as Record<string, unknown>).raw_text
          : null;
      return String(hint ?? "").trim();
    })
    .filter(Boolean);
  const uncoveredAfterDirectEffect = coveredTexts
    .map((covered) => {
      const index = args.input.user_message.indexOf(covered);
      return index >= 0
        ? args.input.user_message.slice(index + covered.length).trim()
        : "";
    })
    .find((suffix) => suffix.length > 0) ?? "";

  return JSON.stringify({
    prompt_version: DISPATCHER_V2_PROMPT_VERSION,
    task: "dispatcher_composite_intent_repair",
    instruction: [
      "Relis le message utilisateur et le TurnFrame déjà produit.",
      "Le champ uncovered_after_direct_effect contient le texte du message qui n'est pas couvert par le raw_text de l'effet direct.",
      "Si ce segment non couvert contient une autre demande explicite compatible, retourne un TurnFrame complet qui conserve l'effet direct déjà détecté et ajoute le signal structuré correspondant.",
      "Ne crée aucun candidat, skill ou opération absent du message.",
      "Ne déclenche aucune action; retourne seulement les signaux structurés.",
      "Si le TurnFrame est déjà complet ou si la suite du message n'est pas une demande explicite, retourne le même TurnFrame.",
      "Pour un tool_skill_intent complexe, fournis operation_input avec un indice minimal et de courtes evidence.",
    ],
    user_message: args.input.user_message,
    covered_texts: coveredTexts,
    uncovered_after_direct_effect: uncoveredAfterDirectEffect,
    recent_messages: args.input.recent_messages.slice(-4),
    plan_snapshot: args.input.plan_snapshot ?? null,
    previous_turn_frame: args.previous,
  });
}

async function maybeRepairCompositeIntentCoverage(args: {
  input: RunDispatcherInput;
  initial: TurnFrame;
  llm_runner: DispatcherLlmRunner;
  model_name: string;
}): Promise<TurnFrame> {
  if (!needsCompositeIntentRepair(args.initial, args.input)) {
    return args.initial;
  }
  try {
    const raw = await args.llm_runner({
      system_prompt:
        `${DISPATCHER_V2_SYSTEM_PROMPT}\n\nTu es encore dans le dispatcher Sophia. Cette passe est une réparation de couverture structurée: elle ne route pas par mots-clés, elle vérifie seulement si le TurnFrame précédent a oublié une autre demande explicite du même message.`,
      user_prompt: buildCompositeIntentRepairPrompt({
        input: args.input,
        previous: args.initial,
      }),
      json_mode: true,
      model_name: args.model_name,
    });
    const repaired = sanitizeLlmTurnFrame(raw, args.input);
    if (
      hasAllOriginalDirectEffects(args.initial, repaired) &&
      hasAdditionalStructuredSignal(args.initial, repaired)
    ) {
      return repaired;
    }
  } catch {
    return args.initial;
  }
  return args.initial;
}

export async function runDispatcher(
  input: RunDispatcherInput,
): Promise<TurnFrame> {
  const started = Date.now();
  const prompt = buildDispatcherPrompt({
    user_message: input.user_message,
    recent_messages: input.recent_messages,
    safety_risk_band: input.safety_context_output.risk_band,
    active_skill_state: input.active_skill_state,
    active_tool_skill_intake: input.active_tool_skill_intake,
    pending_tool_skill_confirmation: input.pending_tool_skill_confirmation,
    active_topic_state: input.active_topic_state,
    flow_state_context: input.flow_state_context,
    plan_snapshot: input.plan_snapshot,
  });
  const modelName = input.model_name ?? "gemini-3-flash-preview";
  let usedLlm = false;
  let output: TurnFrame;

  if (input.llm_runner) {
    usedLlm = true;
    const raw = await input.llm_runner({
      system_prompt: DISPATCHER_V2_SYSTEM_PROMPT,
      user_prompt: prompt,
      json_mode: true,
      model_name: modelName,
    });
    output = sanitizeLlmTurnFrame(raw, input);
    output = await maybeRepairCompositeIntentCoverage({
      input,
      initial: output,
      llm_runner: input.llm_runner,
      model_name: modelName,
    });
  } else {
    output = neutralTurnFrame(input);
  }

  const stats: DispatcherRunStats = {
    latency_ms: Date.now() - started,
    tokens_in: estimateTokens(DISPATCHER_V2_SYSTEM_PROMPT) +
      estimateTokens(prompt),
    tokens_out: estimateTokens(JSON.stringify(output)),
    prompt_version: DISPATCHER_V2_PROMPT_VERSION,
    model_name: modelName,
    used_llm: usedLlm,
  };
  input.on_stats?.(stats);
  return output;
}

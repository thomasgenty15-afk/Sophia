import type {
  CoachingRecommendationCategory,
  CoachingRecommendationSignalContext,
  CoachingRecommendationType,
  ConfidenceBand,
  ConversationChannel,
  ConversationRisk,
  DirectEffectTimeContext,
  DispatcherMemoryPlan,
  DispatcherMemoryRetrievalPolicy,
  DispatcherMemoryTargetType,
  DispatcherResearchSignal,
  Explicitness,
  FeatureOpportunityKind,
  FeatureOpportunitySignalContext,
  PlanRealignmentDriftType,
  PlanRealignmentScope,
  PlanRealignmentSignalContext,
  PresenceConversationKind,
  PresenceConversationSignalContext,
  RiskBand,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import {
  DOMAIN_KEYS_V1,
  DOMAIN_PREFIXES_V1,
} from "../../_shared/memory/domain_keys.ts";
import { getGlobalAiModel } from "../../_shared/gemini.ts";
import { ENTITY_TYPES } from "../../_shared/memory/types.v1.ts";
import type { SafetySignalContext } from "../safety/safety_context.ts";
import {
  buildDispatcherPrompt,
  DISPATCHER_V2_PROMPT_VERSION,
  DISPATCHER_V2_SYSTEM_PROMPT,
} from "./dispatcher.prompts.ts";

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
  active_topic_state?: unknown;
  flow_state_context?: unknown;
  direct_effect_time_context?: DirectEffectTimeContext | null;
  plan_snapshot: unknown;
  safety_context_output: SafetySignalContext;
  conversation_risk_history?: number[];
  source_message_id?: string;
  turn_id?: string;
  llm_runner?: DispatcherLlmRunner;
  model_name?: string;
  on_stats?: (stats: DispatcherRunStats) => void;
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

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function noteInformationFromFlowStateContext(
  flowStateContext: unknown,
): Record<string, unknown> | null {
  const root = recordOrNull(flowStateContext);
  const lastLocalFlowExit = recordOrNull(root?.last_local_flow_exit);
  return recordOrNull(lastLocalFlowExit?.note_information);
}

function evaluateConversationRisk(input: RunDispatcherInput): ConversationRisk {
  const previousScores = recentConversationRiskScores(
    input.conversation_risk_history,
  );
  // P3-A (alex-safety-escalation R1-B03): l'accumulateur était un stub inerte
  // (score=0 sur 15 tours, tour d'idéation compris) — la vigilance post-crise
  // ne tenait que par le composeur. TRAÎNE portée par le pregate: le score du
  // tour précédent décroît de 4 par tour (medium≈6 → 2 → 0 ; crise≈10 → 6 →
  // 2 → 0), le pregate garde ainsi 1-2 tours de mémoire après une détresse.
  const latestPrevious = previousScores.length > 0
    ? previousScores[previousScores.length - 1]
    : 0;
  const trailScore = Math.max(0, latestPrevious - 4);
  return {
    score: trailScore,
    threshold: CONVERSATION_RISK_THRESHOLD,
    should_exit_flows: false,
    reason_codes: trailScore > 0 ? ["previous_risk_trail"] : [],
    previous_scores: previousScores,
    matrix: trailScore > 0
      ? [{
        signal: "previous_risk",
        detected: true,
        weight: 1,
        contribution: trailScore,
        evidence: "traine du band du tour precedent",
      }]
      : [],
    context_summary: null,
  };
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
  };
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
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

function optionalText(value: unknown, max = 160): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function enumString<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = String(raw ?? "").trim();
  return (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function coachingTypeFromLegacyCategory(
  value: CoachingRecommendationCategory,
): CoachingRecommendationType {
  return value === "plan_action_coaching"
    ? "plan_action"
    : value === "free_action_coaching"
    ? "no_plan_action"
    : value === "emotional_state_coaching"
    ? "emotional"
    : "ambiguous";
}

function sanitizeCoachingRecommendationSignalContext(
  raw: unknown,
): CoachingRecommendationSignalContext | undefined {
  const root = objectRecord(raw);
  if (!root) return undefined;
  const legacyCategory = enumString<CoachingRecommendationCategory>(
    root.category,
    [
      "plan_action_coaching",
      "free_action_coaching",
      "emotional_state_coaching",
      "ambiguous_coaching_need",
    ],
    "ambiguous_coaching_need",
  );
  const coachingType = enumString<CoachingRecommendationType>(
    root.coaching_type,
    [
      "plan_action",
      "no_plan_action",
      "emotional",
      "ambiguous",
    ],
    coachingTypeFromLegacyCategory(legacyCategory),
  );
  const actionRoot = objectRecord(root.action_context);
  return {
    coaching_type: coachingType,
    confidence: optionalScore(root.confidence) ??
      (root.confidence_band === "high" || root.confidence_band === "critical"
        ? 0.9
        : root.confidence_band === "medium"
        ? 0.65
        : 0.5),
    reason: optionalText(root.reason, 240) ?? "",
    action_context: actionRoot
      ? {
        source: enumString(
          actionRoot.source,
          ["plan", "free", "none", "ambiguous"],
          "ambiguous",
        ),
        plan_item_id: optionalText(actionRoot.plan_item_id, 80),
        action_title: optionalText(actionRoot.action_title, 160),
      }
      : null,
  };
}

function sanitizeFeatureOpportunitySignalContext(
  raw: unknown,
): FeatureOpportunitySignalContext | undefined {
  const root = objectRecord(raw);
  if (!root) return undefined;
  const feature = enumString<FeatureOpportunityKind>(
    root.feature,
    ["initiatives", "coach_preferences"],
    "initiatives",
  );
  return {
    feature,
    opportunity_kind: enumString(
      root.opportunity_kind,
      [
        "recurring_context",
        "ritual_or_initiative",
        "coach_style_feedback",
        "coach_interaction_preference",
      ],
      feature === "coach_preferences"
        ? "coach_interaction_preference"
        : "recurring_context",
    ),
    trigger_context: optionalText(root.trigger_context, 200),
    user_problem_summary: optionalText(root.user_problem_summary, 240) ?? "",
    priority_reason: optionalText(root.priority_reason, 240) ?? "",
  };
}

function sanitizePlanRealignmentSignalContext(
  raw: unknown,
): PlanRealignmentSignalContext | undefined {
  const root = objectRecord(raw);
  if (!root) return undefined;
  return {
    drift_type: enumString<PlanRealignmentDriftType>(
      root.drift_type,
      [
        "missed_plan",
        "late_on_plan",
        "lost_rhythm",
        "plan_too_heavy",
        "plan_too_light",
        "changed_context",
        "ambiguous",
      ],
      "ambiguous",
    ),
    scope: enumString<PlanRealignmentScope>(
      root.scope,
      ["whole_plan", "week", "level", "unknown"],
      "unknown",
    ),
    explicit_adjust_request: root.explicit_adjust_request === true,
    product_execution_allowed: false,
    reason: optionalText(root.reason, 240) ?? "",
  };
}

function sanitizePresenceConversationSignalContext(
  raw: unknown,
): PresenceConversationSignalContext | undefined {
  const root = objectRecord(raw);
  if (!root) return undefined;
  return {
    kind: enumString<PresenceConversationKind>(
      root.kind,
      ["maintain", "tool_pull", "closure", "topic_change"],
      "maintain",
    ),
    topic_hint: optionalText(root.topic_hint, 200),
    reason: optionalText(root.reason, 240) ?? "",
  };
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

function sanitizeDirectEffect(
  raw: unknown,
): TurnFrame["direct_effects"][number] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const effect = raw as Record<string, unknown>;
  const effectType = String(effect.effect_type ?? "").trim();
  if (
    effectType !== "create_one_shot_reminder" &&
    effectType !== "track_progress_plan_item"
  ) return null;
  const explicitnessRaw = String(effect.explicitness ?? "").trim();
  const explicitness: Explicitness = explicitnessRaw === "explicit" ||
      explicitnessRaw === "implied" || explicitnessRaw === "weak"
    ? explicitnessRaw
    : "weak";
  const targetStatusRaw = String(effect.target_status ?? "").trim();
  const targetStatus = targetStatusRaw === "identified" ||
      targetStatusRaw === "ambiguous" || targetStatusRaw === "missing"
    ? targetStatusRaw
    : "missing";
  const confidenceRaw = String(effect.confidence_band ?? "").trim();
  const confidenceBand: ConfidenceBand = confidenceRaw === "low" ||
      confidenceRaw === "medium" || confidenceRaw === "high" ||
      confidenceRaw === "critical"
    ? confidenceRaw
    : "low";
  if (
    explicitness !== "explicit" ||
    targetStatus !== "identified" ||
    (confidenceBand !== "high" && confidenceBand !== "critical")
  ) return null;
  return {
    effect_type: effectType,
    explicitness,
    target_status: targetStatus,
    confidence_band: confidenceBand,
    payload_hint: objectRecord(effect.payload_hint) ?? {},
  };
}

function sanitizeDirectEffects(raw: unknown): TurnFrame["direct_effects"] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const effects: TurnFrame["direct_effects"] = [];
  for (const item of raw) {
    const effect = sanitizeDirectEffect(item);
    if (!effect || seen.has(effect.effect_type)) continue;
    seen.add(effect.effect_type);
    effects.push(effect);
  }
  return effects;
}

function sanitizeSkillSignal(
  raw: unknown,
  kind?:
    | "coaching_recommendation"
    | "feature_opportunity"
    | "plan_realignment"
    | "presence_conversation"
    | "product_help",
): {
  detected: boolean;
  confidence_band: ConfidenceBand;
  score?: number;
  reason?: string;
  context?:
    | CoachingRecommendationSignalContext
    | FeatureOpportunitySignalContext
    | PlanRealignmentSignalContext
    | PresenceConversationSignalContext;
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
  const context = kind === "coaching_recommendation"
    ? sanitizeCoachingRecommendationSignalContext(signal.context)
    : kind === "feature_opportunity"
    ? sanitizeFeatureOpportunitySignalContext(signal.context)
    : kind === "plan_realignment"
    ? sanitizePlanRealignmentSignalContext(signal.context)
    : kind === "presence_conversation"
    ? sanitizePresenceConversationSignalContext(signal.context)
    : undefined;
  return {
    detected: signal.detected === true,
    confidence_band: confidenceBand,
    ...(score !== undefined ? { score } : {}),
    ...(reason ? { reason } : {}),
    ...(context ? { context } : {}),
  };
}

function sanitizeSkillSignals(
  raw: unknown,
): NonNullable<TurnFrame["skill_signals"]> {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const directProductHelp = sanitizeSkillSignal(
    root.product_help,
    "product_help",
  );
  const directCoachingRecommendation = sanitizeSkillSignal(
    root.coaching_recommendation,
    "coaching_recommendation",
  );
  const directFeatureOpportunity = sanitizeSkillSignal(
    root.feature_opportunity,
    "feature_opportunity",
  );
  const directPlanRealignment = sanitizeSkillSignal(
    root.plan_realignment,
    "plan_realignment",
  );
  const directPresenceConversation = sanitizeSkillSignal(
    root.presence_conversation,
    "presence_conversation",
  );
  const entryRoot = root.entry && typeof root.entry === "object" &&
      !Array.isArray(root.entry)
    ? root.entry as Record<string, unknown>
    : {};
  const entryProductHelp = sanitizeSkillSignal(
    entryRoot.product_help,
    "product_help",
  );
  const entryCoachingRecommendation = sanitizeSkillSignal(
    entryRoot.coaching_recommendation,
    "coaching_recommendation",
  );
  const entryFeatureOpportunity = sanitizeSkillSignal(
    entryRoot.feature_opportunity,
    "feature_opportunity",
  );
  const entryPlanRealignment = sanitizeSkillSignal(
    entryRoot.plan_realignment,
    "plan_realignment",
  );
  const entryPresenceConversation = sanitizeSkillSignal(
    entryRoot.presence_conversation,
    "presence_conversation",
  );
  const productHelp = directProductHelp ?? entryProductHelp;
  const coachingRecommendation = directCoachingRecommendation ??
    entryCoachingRecommendation;
  const featureOpportunity = directFeatureOpportunity ??
    entryFeatureOpportunity;
  const planRealignment = directPlanRealignment ?? entryPlanRealignment;
  const presenceConversation = directPresenceConversation ??
    entryPresenceConversation;
  const signals: NonNullable<TurnFrame["skill_signals"]> = {};
  if (productHelp?.detected === true) {
    signals.product_help = productHelp;
  }
  if (coachingRecommendation?.detected === true) {
    signals.coaching_recommendation = coachingRecommendation as any;
  }
  if (planRealignment?.detected === true) {
    signals.plan_realignment = planRealignment as any;
  }
  if (featureOpportunity?.detected === true) {
    signals.feature_opportunity = featureOpportunity as any;
  }
  if (presenceConversation?.detected === true) {
    signals.presence_conversation = presenceConversation as any;
  }
  return signals;
}

export function buildNeutralTurnFrame(input: RunDispatcherInput): TurnFrame {
  const safetyRisk = input.safety_context_output.risk_band;
  const conversationRisk = evaluateConversationRisk(input);
  const noteInformation = noteInformationFromFlowStateContext(
    input.flow_state_context,
  );
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
    direct_effect_time_context: input.direct_effect_time_context ?? undefined,
    note_information: noteInformation as any,
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

  const safetyBlocksToolSkills = safetyRisk === "high" ||
    safetyRisk === "critical";
  if (safetyBlocksToolSkills) {
    turnFrame.direct_effects = [];
    turnFrame.skill_signals = {};
  }

  return suppressConcurrentRoutingDuringReview(input, turnFrame);
}

function sanitizeLlmTurnFrame(
  candidate: unknown,
  input: RunDispatcherInput,
): TurnFrame {
  const baseline = buildNeutralTurnFrame(input);
  const raw = candidate && typeof candidate === "object"
    ? candidate as any
    : {};
  const safetyRisk = riskMax(
    input.safety_context_output.risk_band,
    raw?.safety?.risk_band ?? baseline.safety.risk_band,
  );
  const skillSignals = sanitizeSkillSignals(raw?.skill_signals);
  const baselineConversationRisk = baseline.conversation_risk ??
    evaluateConversationRisk(input);
  // P3-A: en fenêtre de traîne post-détresse, un band none remonte au
  // plancher « low » (traçabilité pregate, non bloquant) — une mention
  // chargée dans la fenêtre n'arrive plus sur un pregate amnésique.
  const safetyRiskWithTrail =
    baselineConversationRisk.score > 0 && safetyRisk === "none"
      ? "low" as const
      : safetyRisk;
  const safetyBlocksToolSkills = safetyRisk === "high" ||
    safetyRisk === "critical";
  const needsResearch = sanitizeResearchSignal(
    raw?.needs_research,
    baseline.needs_research ?? DEFAULT_RESEARCH_SIGNAL,
    input.user_message,
  );
  const directEffects = sanitizeDirectEffects(raw?.direct_effects);
  const memoryPlan = suppressActionAndLevelMemoryDuringReview(
    sanitizeMemoryPlan(raw?.memory_plan, baseline.memory_plan),
    input,
  );
  // P2-1 (paul-untested15 R1-B01, eva-global17 R1-B02): invariant de cohérence
  // intra-frame — un tour que le plan classe status_check_* ne porte JAMAIS un
  // create silencieux (« il est toujours bon mon rappel de 8h ? » sortait en
  // create explicit/high ET response_intent=status_check_reminder → rappel
  // annulé recréé sans le dire). Le create pur est droppé, la projection DB
  // répond ; les intents cancel/replace/status du même tour survivent
  // (multi-intention rose T14 : « annule-le et dis-moi ce qui reste »).
  const responseIntentNormalized = String(memoryPlan.response_intent ?? "")
    .trim().toLowerCase();
  const statusCheckIntent = responseIntentNormalized.startsWith(
    "status_check",
  ) || responseIntentNormalized.startsWith("verify_reminder");
  let guardedDirectEffects = statusCheckIntent
    ? directEffects.filter((effect) => {
      if (effect.effect_type !== "create_one_shot_reminder") return true;
      const payloadIntent = String(
        (effect.payload_hint as Record<string, unknown> | undefined)?.intent ??
          "create",
      ).trim().toLowerCase();
      return payloadIntent !== "create" && payloadIntent !== "";
    })
    : directEffects;
  // P3-C (paul-untested16 R1-B01): même invariant intra-frame que P2-1, côté
  // CORRECTION — le frame se classait lui-même track_progress_correction
  // (confiance 0.95) pendant que l'émission portait correction=false : la
  // fausse entrée survivait. Le flag se pose déterministiquement depuis la
  // classification du frame ; le runtime résout retarget_from (last commit).
  if (responseIntentNormalized.includes("correction")) {
    guardedDirectEffects = guardedDirectEffects.map((effect) => {
      if (effect.effect_type !== "track_progress_plan_item") return effect;
      const payload = (effect.payload_hint ?? {}) as Record<string, unknown>;
      if (payload.correction === true) return effect;
      return {
        ...effect,
        payload_hint: { ...payload, correction: true },
      };
    });
  }
  // P1-2: champ racine (survit même quand aucun skill signal n'est detected).
  const sessionStyleCommitmentHint = String(
    raw?.session_style_commitment_hint ?? "",
  ).trim().slice(0, 200);
  return {
    ...baseline,
    user_id: input.user_id,
    channel: input.channel,
    safety: {
      risk_band: safetyRiskWithTrail,
      reason_codes: Array.isArray(raw?.safety?.reason_codes)
        ? raw.safety.reason_codes.map(String)
        : baseline.safety.reason_codes,
      evidence: Array.isArray(raw?.safety?.evidence)
        ? raw.safety.evidence.map(String)
        : baseline.safety.evidence,
    },
    conversation_risk: baselineConversationRisk,
    direct_effects: safetyBlocksToolSkills ? [] : guardedDirectEffects,
    direct_effect_time_context: baseline.direct_effect_time_context,
    note_information: baseline.note_information,
    skill_signals: safetyBlocksToolSkills ? {} : skillSignals,
    session_style_commitment_hint: sessionStyleCommitmentHint || null,
    needs_research: safetyBlocksToolSkills
      ? DEFAULT_RESEARCH_SIGNAL
      : needsResearch,
    action_reference: baseline.action_reference,
    level_reference: baseline.level_reference,
    memory_plan: memoryPlan,
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
  return frame.skill_signals?.product_help?.detected === true ||
    frame.skill_signals?.coaching_recommendation?.detected === true ||
    frame.skill_signals?.plan_realignment?.detected === true ||
    frame.skill_signals?.feature_opportunity?.detected === true;
}

function hasAdditionalStructuredSignal(
  original: TurnFrame,
  repaired: TurnFrame,
): boolean {
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
      "Ne propose aucune route locale, skill legacy ou opportunite de flow pendant cette reparation.",
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
    active_topic_state: input.active_topic_state,
    flow_state_context: input.flow_state_context,
    direct_effect_time_context: input.direct_effect_time_context ?? null,
    plan_snapshot: input.plan_snapshot,
  });
  const modelName = input.model_name ?? getGlobalAiModel();
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
    output = buildNeutralTurnFrame(input);
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

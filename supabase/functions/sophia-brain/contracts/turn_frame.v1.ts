import type { NoteInformation } from "./note_information.v1.ts";

export type ConfidenceBand = "low" | "medium" | "high" | "critical";
export type Explicitness = "explicit" | "implied" | "weak";
export type Ambiguity =
  | "none"
  | "target_ambiguous"
  | "intent_ambiguous"
  | "both";
export type RiskBand = "none" | "low" | "medium" | "high" | "critical";
export type Intensity = "none" | "low" | "medium" | "high";

export type ConversationChannel = "web" | "whatsapp";

export type DirectEffectType =
  | "create_one_shot_reminder"
  | "track_progress_plan_item";

export type DirectEffectTimeContext = {
  now_utc: string;
  user_timezone: string;
  user_locale: string;
  user_local_datetime: string;
  user_local_human: string;
};

export type SkillSignal = {
  detected: boolean;
  confidence_band: ConfidenceBand;
  score?: number;
  reason?: string;
};

export type CoachingRecommendationCategory =
  | "plan_action_coaching"
  | "free_action_coaching"
  | "emotional_state_coaching"
  | "ambiguous_coaching_need";

export type CoachingRecommendationType =
  | "plan_action"
  | "no_plan_action"
  | "emotional"
  | "ambiguous";

export type CoachingFailureMode =
  | "forgetting"
  | "launch_blocker"
  | "avoidance"
  | "risk_moment"
  | "too_hard"
  | "rhythm_mismatch"
  | "misaligned_action"
  | "unclear";

export type CoachingRecommendationPriorityFeature =
  | "attack_card"
  | "defense_card"
  | "adjust_plan"
  | "state_potion";

export type CoachingRecommendationSignalContext = {
  coaching_type: CoachingRecommendationType;
  confidence: number;
  reason: string;
  action_context: {
    source: "plan" | "free" | "none" | "ambiguous";
    plan_item_id?: string | null;
    action_title?: string | null;
  } | null;
  needs_type_confirmation?: boolean;
};

export type FeatureOpportunityKind =
  | "initiatives"
  | "coach_preferences";

export type FeatureOpportunitySignalContext = {
  feature: FeatureOpportunityKind;
  opportunity_kind:
    | "recurring_context"
    | "ritual_or_initiative"
    | "coach_style_feedback"
    | "coach_interaction_preference";
  trigger_context?: string | null;
  user_problem_summary: string;
  priority_reason: string;
};

export type DispatcherSkillSignals = {
  product_help?: SkillSignal;
  coaching_recommendation?: SkillSignal & {
    context?: CoachingRecommendationSignalContext;
  };
  feature_opportunity?: SkillSignal & {
    context?: FeatureOpportunitySignalContext;
  };
};

export type DispatcherMemoryTargetType =
  | "topic"
  | "event"
  | "action"
  | "level"
  | "entity"
  | "runtime_snapshot"
  | "domain_key"
  | "domain_prefix";

export type DispatcherMemoryRetrievalPolicy =
  | "force_taxonomy"
  | "taxonomy_first"
  | "semantic_first"
  | "semantic_only";

export type DispatcherMemoryPlan = {
  // Dispatcher output only. The dispatcher plans what memory/context is needed;
  // context/loader.ts is responsible for materializing it.
  response_intent?: string;
  reasoning_complexity?: "low" | "medium" | "high";
  context_need: "minimal" | "targeted" | "broad" | "dossier";
  memory_mode: "none" | "light" | "broad" | "dossier";
  model_tier_hint?: "lite" | "standard" | "deep";
  context_budget_tier: "tiny" | "small" | "medium" | "large";
  targets: Array<{
    type: DispatcherMemoryTargetType;
    key: string;
    query_hint?: string | null;
    expansion_policy?: string | null;
    retrieval_policy?: DispatcherMemoryRetrievalPolicy | null;
    priority?: "low" | "medium" | "high" | null;
    entity_type?: string | null;
  }>;
  retrieval_policy: DispatcherMemoryRetrievalPolicy;
  plan_confidence?: number;
};

export type DispatcherActionReference = {
  detected: boolean;
  status: "none" | "identified" | "ambiguous" | "family_only";
  plan_item_id?: string | null;
  action_title?: string | null;
  action_family_key?: string | null;
  action_type?: "habit" | "mission" | "clarification" | "other" | null;
  expansion_policy?:
    | "exact_action_only"
    | "exact_then_action_family_recent"
    | "none"
    | null;
  reason?: string | null;
};

export type DispatcherLevelReference = {
  detected: boolean;
  status: "none" | "current_level" | "previous_level" | "transition" | "global";
  level_id?: string | null;
  transformation_id?: string | null;
  expansion_policy?: "include_level_execution_handoff" | "none" | null;
  reason?: string | null;
};

export type DispatcherResearchSignal = {
  detected: boolean;
  value?: boolean;
  query?: string | null;
  domain_hint?: string | null;
  confidence?: number;
  reason?: string | null;
};

export type ConversationRiskMatrixRow = {
  signal:
    | "system_misunderstanding"
    | "explicit_stop_or_abandon"
    | "anger_or_profanity"
    | "repetition_or_correction"
    | "typographic_intensity"
    | "active_flow_pressure"
    | "previous_risk";
  detected: boolean;
  weight: number;
  contribution: number;
  evidence?: string | null;
};

export type ConversationRisk = {
  score: number;
  threshold: number;
  should_exit_flows: boolean;
  reason_codes: string[];
  previous_scores: number[];
  matrix: ConversationRiskMatrixRow[];
  context_summary: string | null;
};

export type TurnFrame = {
  turn_id: string;
  source_message_id: string;
  user_id: string;
  channel: ConversationChannel;

  safety: {
    risk_band: RiskBand;
    reason_codes: string[];
    evidence: string[];
  };

  conversation_risk?: ConversationRisk;

  confirmation_response?: {
    kind: "yes" | "no" | "correction_to_pending" | "topic_change" | "unknown";
    confidence_band: ConfidenceBand;
  };

  direct_effects: Array<{
    effect_type: DirectEffectType;
    explicitness: Explicitness;
    target_status: "identified" | "ambiguous" | "missing";
    confidence_band: ConfidenceBand;
    payload_hint: Record<string, unknown>;
  }>;

  direct_effect_time_context?: DirectEffectTimeContext;

  note_information?: NoteInformation | null;

  skill_signals: DispatcherSkillSignals;

  needs_research?: DispatcherResearchSignal;

  action_reference?: DispatcherActionReference;
  level_reference?: DispatcherLevelReference;

  // Memory boundary: dispatcher produces this plan, but never loads or writes
  // durable memory. Skills consume the LoadedContext produced from this plan.
  memory_plan: DispatcherMemoryPlan;
};

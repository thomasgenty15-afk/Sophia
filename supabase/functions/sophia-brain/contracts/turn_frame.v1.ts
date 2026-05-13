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

export type ToolSkillOpportunityType =
  | "attack_card"
  | "defense_card"
  | "plan_adjustment"
  | "portion"
  | "state_potion"
  | "self_reminder"
  | "none";

export type ToolSkillOpportunity = {
  type: ToolSkillOpportunityType;
  operation_type:
    | "prepare_attack_card"
    | "prepare_defense_card"
    | "adjust_plan_item"
    | "select_state_potion"
    | "create_recurring_reminder"
    | null;
  surface_id:
    | "attack_card"
    | "defense_card"
    | "plan_item.reduce"
    | "plan_item.clarify"
    | "potion.state"
    | "dashboard.reminders"
    | null;
  confidence_band: Exclude<ConfidenceBand, "critical">;
  should_offer: boolean;
  prop_reason: string | null;
  source_span: string | null;
  target_hint: string | null;
  target_status: "identified" | "ambiguous" | "missing" | "none";
  suggested_question_intent:
    | "offer_attack_card"
    | "offer_defense_card"
    | "offer_plan_adjustment"
    | "offer_portion"
    | "offer_state_potion"
    | "offer_self_reminder"
    | null;
  offer_timing: "now" | "after_current_pending" | "weekly" | "never";
  must_not_execute: true;
};

export type DispatcherMemoryTargetType =
  | "topic"
  | "event"
  | "action"
  | "entity"
  | "domain_key"
  | "domain_prefix";

export type DispatcherMemoryRetrievalPolicy =
  | "force_taxonomy"
  | "taxonomy_first"
  | "semantic_first"
  | "semantic_only";

export type DispatcherMemoryPlan = {
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
  flow_exit_context?: {
    interrupted_flow_type:
      | "tool_skill"
      | "conversation_skill"
      | "pending_confirmation"
      | "none";
    restart_scope: "tool_subskill" | "conversation_skill" | "silent_reset";
    active_tool_skill_type?: string | null;
    active_conversation_skill_id?: string | null;
    known_slots?: Record<string, unknown> | null;
    pending_confirmation?: unknown;
    last_user_message: string;
    reason_codes: string[];
  } | null;
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

  tool_skill_intents: Array<{
    operation_type: string;
    explicitness: Explicitness;
    target_hint?: string;
    confidence_band: ConfidenceBand;
    ambiguity: Ambiguity;
    user_intent:
      | "create"
      | "update"
      | "adjust"
      | "select"
      | "explain_only"
      | "none";
  }>;

  tool_skill_opportunity: ToolSkillOpportunity;

  skill_signals: {
    entry?: Record<
      string,
      { detected: boolean; confidence_band: ConfidenceBand; reason?: string }
    >;
    lifecycle?: Record<
      string,
      { detected: boolean; confidence_band: ConfidenceBand; reason?: string }
    >;
    exit?: Record<
      string,
      { detected: boolean; confidence_band: ConfidenceBand; reason?: string }
    >;
  };

  memory_plan: DispatcherMemoryPlan;
};

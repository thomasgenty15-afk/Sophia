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
  | "coach_preferences"
  | "none";

export type ToolSkillOpportunity = {
  type: ToolSkillOpportunityType;
  operation_type:
    | "prepare_attack_card"
    | "prepare_defense_card"
    | "adjust_plan_item"
    | "select_state_potion"
    | "create_recurring_reminder"
    | "update_coach_preferences"
    | null;
  surface_id:
    | "attack_card"
    | "defense_card"
    | "plan_item.reduce"
    | "plan_item.clarify"
    | "potion.state"
    | "dashboard.reminders"
    | "dashboard.preferences"
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
    | "offer_coach_preferences"
    | null;
  offer_timing: "now" | "after_current_pending" | "weekly" | "never";
  must_not_execute: true;
};

export type DispatcherMemoryTargetType =
  | "topic"
  | "event"
  | "action"
  | "level"
  | "entity"
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

  active_handoff_action?: {
    type:
      | "handoff_apply_attempt"
      | "repeat_handoff"
      | "platform_destination_followup"
      | "revise_handoff"
      | "field_confirmation"
      | "cancel_handoff"
      | "clarify_handoff"
      | "topic_change";
    confidence: "low" | "medium" | "high";
    evidence: string[];
    target_skill_id?: string | null;
  } | null;

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
    operation_input?: Record<string, unknown>;
    payload_hint?: Record<string, unknown>;
    adjust_plan_scope?: "specific_action" | "current_level" | "whole_plan";
    rejected_operations?: string[];
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

  needs_research?: DispatcherResearchSignal;

  action_reference?: DispatcherActionReference;
  level_reference?: DispatcherLevelReference;

  // Memory boundary: dispatcher produces this plan, but never loads or writes
  // durable memory. Skills consume the LoadedContext produced from this plan.
  memory_plan: DispatcherMemoryPlan;
};

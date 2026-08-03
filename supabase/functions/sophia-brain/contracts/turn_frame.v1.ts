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

/**
 * Durable effects a turn may request.
 *
 * W4.3 opened this union to the two KEEL fact-writers. They are NOT a new
 * genre: `log_protocol_event` and `declare_deviation` write FACTS
 * (`protocol_events`, `planned_deviations`) exactly as
 * `track_progress_plan_item` does, so they inherit the whole doctrinal chain
 * unchanged — contract -> gate (default-deny, safety blocks at band >= medium)
 * -> executor (write-through) -> ledger -> renderer (never acknowledges
 * without a committed effect).
 *
 * The gate rule was written in W3.3, BEFORE these two values existed
 * (`routers/direct_effect_gate.ts`, exemption list closed). Adding a value
 * here therefore blocks it in crisis by construction; it never has to be
 * remembered. `routers/direct_effect_gate_keel_test.ts` pins that property.
 */
export type DirectEffectType =
  | "create_one_shot_reminder"
  | "track_progress_plan_item"
  | "log_protocol_event"
  | "declare_deviation";

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
};

export type PlanRealignmentDriftType =
  | "missed_plan"
  | "late_on_plan"
  | "lost_rhythm"
  | "plan_too_heavy"
  // nina-r4 B03 / paul-r6 B03: « trop mou / corse / plus d'ambition » etait
  // collapse sur plan_too_heavy (direction OPPOSEE) faute de bucket dedie.
  | "plan_too_light"
  | "changed_context"
  | "ambiguous";

export type PlanRealignmentScope =
  | "whole_plan"
  | "week"
  | "level"
  | "unknown";

export type PlanRealignmentSignalContext = {
  drift_type: PlanRealignmentDriftType;
  scope: PlanRealignmentScope;
  explicit_adjust_request: boolean;
  product_execution_allowed: false;
  reason: string;
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

// Flow « Présence » (mode ami): une conversation pure centrée sur un sujet de
// fond. Aucune offre produit n'y vit: si le user demande un outil, on SORT.
// `kind` classe le mouvement conversationnel du tour COURANT (utilisé surtout
// quand le flow est déjà actif pour décider maintien vs sortie):
// - maintain: le user continue d'explorer/déposer/raisonner — y compris les
//   demandes de méthode (« concrètement je fais quoi ? »), servies en
//   conversation. Défaut.
// - tool_pull: il accepte ou demande explicitement un dispositif produit
//   (« ok vas-y la carte », « prépare-moi une potion ») → sortie du flow vers
//   le dispatcher global.
// - closure: clôture naturelle (« merci, bonne nuit »).
// - topic_change: pivot net vers un autre sujet ou une tâche.
export type PresenceConversationKind =
  | "maintain"
  | "tool_pull"
  | "closure"
  | "topic_change";

export type PresenceConversationSignalContext = {
  kind: PresenceConversationKind;
  // Sujet lourd/personnel que le user est en train de traiter — sert la
  // continuité visible et le contexte re-synthétisé au handoff.
  topic_hint?: string | null;
  reason: string;
};

// KEEL W4.4 — flow léger `plan_question`: le student pose une question
// D'EXÉCUTION à l'intérieur du plan (« je peux remplacer le riz par des
// pâtes ? », « je suis au resto », « j'ai décalé le déjeuner »). Distinct de
// `plan_realignment`, qui est une lane de DÉCROCHAGE (le plan ne tient plus et
// doit changer). Le contexte porte les deux slugs `food_groups` bruts: le
// resolver Tier 0 les parse fail-loud et n'en devine JAMAIS un.
export type PlanQuestionKind =
  | "food_swap"
  | "eating_out"
  | "meal_shifted"
  | "other";

export type PlanQuestionSignalContext = {
  kind: PlanQuestionKind;
  /** Slug `food_groups` que l'élève veut MANGER À LA PLACE. Brut, non validé. */
  requested_food_group?: string | null;
  /** Slug `food_groups` prescrit, tel que l'élève le nomme. Brut, non validé. */
  prescribed_food_group?: string | null;
  /** Créneau visé (`slot_vocabulary`), quand l'élève le nomme. Brut. */
  slot_hint?: string | null;
  reason: string;
};

export type DispatcherSkillSignals = {
  product_help?: SkillSignal;
  coaching_recommendation?: SkillSignal & {
    context?: CoachingRecommendationSignalContext;
  };
  plan_realignment?: SkillSignal & {
    context?: PlanRealignmentSignalContext;
  };
  // W2.A: `feature_opportunity` (initiatives / coach_preferences) est retiré
  // du contrat de signaux — la lane n'est plus routable. Le type de contexte
  // `FeatureOpportunitySignalContext` reste défini ci-dessus tant que le skill
  // existe en code (supprimé en W2.B).
  presence_conversation?: SkillSignal & {
    context?: PresenceConversationSignalContext;
  };
  // W4.4 — KEEL only. La lane ne s'ouvre que pour un `keel_role='student'`
  // (routers.ts gate sur `keel_student`): sans commitments il n'y a rien à
  // résoudre, et le legacy n'a ni swap_policy ni food_groups.
  plan_question?: SkillSignal & {
    context?: PlanQuestionSignalContext;
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

  // P1-2 (ALEX-CPR-B04 / EVA-CPR-B03): contrainte de STYLE session formulée
  // court, ancrée sur les mots du user (« réponses plus courtes le soir »,
  // « pas de technique »). Champ RACINE (pas dans skill_signals: un signal
  // non-detected est droppé par la normalisation, or la contrainte de style
  // arrive souvent sans vraie opportunité produit). Le runtime l'installe en
  // `__session_style_commitments` (temp_memory, session only, jamais une
  // préférence durable — BF-PREF-01). Null sinon.
  session_style_commitment_hint?: string | null;

  needs_research?: DispatcherResearchSignal;

  action_reference?: DispatcherActionReference;
  level_reference?: DispatcherLevelReference;

  // Memory boundary: dispatcher produces this plan, but never loads or writes
  // durable memory. Skills consume the LoadedContext produced from this plan.
  memory_plan: DispatcherMemoryPlan;
};

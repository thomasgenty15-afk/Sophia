import type { NoteInformation } from "../../contracts/note_information.v1.ts";
import type { LocalOneShotDirectEffectRequest } from "../../router/one_shot_local_direct_effect.ts";
import type {
  CoachingFailureMode,
  CoachingRecommendationCategory,
  CoachingRecommendationSignalContext,
} from "../../contracts/turn_frame.v1.ts";

export type CoachingFeatureSuggestion =
  | "adjust_plan"
  | "attack_card"
  | "defense_card"
  | "state_potion";

export type CoachingType =
  | "plan_action"
  | "no_plan_action"
  | "emotional"
  | "unclear";

export type CoachingRecommendationFlowAction =
  | "continue_clarifying_need"
  | "compare_features"
  | "recommend_feature"
  | "answer_followup"
  | "close_flow"
  | "exit_to_global_dispatcher";

export type CoachingRecommendationVisibleTaskKind =
  | "change_confirm_coaching_type"
  | "emotion_coaching"
  | "no_plan_coaching"
  | "action_plan_coaching"
  // Deprecated legacy step kinds kept only to normalize older model outputs.
  // The active local dispatcher prompt must not select them.
  | "ask_difficulty_clarification"
  | "explain_cause"
  | "recommend_feature"
  | "free_action_coaching"
  | "explain_platform_destination"
  | "answer_followup"
  | "close_recommendation"
  // Backward-compatible parser aliases. The reducer maps these to specialized
  // step contexts before the visible agent is called.
  | "ask_need_clarification"
  | "compare_features"
  | "exit_ack";

export type CoachingIntentKind =
  | "stuck_action"
  | "forgetting"
  | "avoidance"
  | "risk_moment"
  | "plan_misaligned"
  | "feature_choice"
  | "preference_request"
  | "general_support"
  | "off_topic"
  | "safety"
  | "unclear";

export type CoachingFeatureCandidate = {
  feature: CoachingFeatureSuggestion;
  fit: "low" | "medium" | "high";
  why: string;
  destination_hint: string | null;
};

export type CoachingVisibleDecisionLever =
  | "attack_card"
  | "defense_card"
  | "adjust_plan"
  | "free_attack_card"
  | "free_defense_card"
  | "coaching_only"
  | "state_potion";

export type CoachingAttackCardTechnique =
  | "texte_magique"
  | "mantra_force"
  | "ancre_visuelle"
  | "meditation_5_min"
  | "preparer_terrain"
  | "mot_de_bascule";

export type CoachingPotionType =
  | "apaisement"
  | "amour"
  | "courage"
  | "clarte"
  | "guerison"
  | "anti_decrochage";

export type CoachingVisibleDecision = {
  lever: CoachingVisibleDecisionLever;
  variant: CoachingAttackCardTechnique | null;
  potion_type: CoachingPotionType | null;
  reason: string;
  confidence: "low" | "medium" | "high";
};

export type CoachingDifficulty = {
  target_kind: "plan_action" | "free_action" | "emotional_state" | "unclear";
  summary: string | null;
  action_title: string | null;
  action_source: "plan" | "free" | "none" | "ambiguous";
};

export type CoachingCauseAnalysis = {
  primary_cause:
    | "forgetting"
    | "launch_blocker"
    | "avoidance"
    | "risk_moment"
    | "too_hard"
    | "rhythm_mismatch"
    | "misaligned_action"
    | "emotional_overload"
    | "unclear";
  why_it_exists: string | null;
  confidence: "low" | "medium" | "high";
  missing_info: string[];
};

export type CoachingRecommendationDecision = {
  primary_feature: CoachingFeatureSuggestion | null;
  secondary_feature: CoachingFeatureSuggestion | null;
  why_primary: string | null;
  why_not_others: Partial<Record<CoachingFeatureSuggestion, string>>;
  platform_destination: {
    label: string | null;
    surface_hint: string | null;
    user_facing_destination: string | null;
  };
  user_facing_next_step: string | null;
};

export type CoachingFeatureProductGuidance = {
  feature: CoachingFeatureSuggestion;
  catalog_feature_id: string;
  label: string;
  explain: string;
  how_to: string;
  locations: Array<{
    surface: string;
    when_visible: string;
    user_can_do: string[];
  }>;
  limits: string[];
  sophia_must_not_claim: string[];
};

export type CoachingRecommendationFlowContext = {
  coaching_type: CoachingType;
  candidate_coaching_type: CoachingType | null;
  coaching_type_reason: string | null;
  parent_flow_id?:
    | "daily_action_review_v1"
    | "weekly_adaptive_review_v1"
    | null;
  parent_return_focus?: string | null;
  parent_action_context?: Record<string, unknown> | null;
  parent_state_summary?: string | null;
  dispatcher_signal_context: CoachingRecommendationSignalContext | null;
  direct_effect_lane?: Record<string, unknown> | null;
  direct_effect_confirmation_context?: Record<string, unknown> | null;
  product_guidance: Partial<
    Record<CoachingFeatureSuggestion, CoachingFeatureProductGuidance>
  >;
  difficulty: CoachingDifficulty;
  cause_analysis: CoachingCauseAnalysis;
  recommendation: CoachingRecommendationDecision;
  evidence_used: string[];
  missing_or_weak_values: string[];
  tone_constraints: string[];
  do_not_say: string[];
  /**
   * Coherence technique↔nature-du-besoin, decidee par le dispatcher local et
   * RE-EVALUEE a chaque tour (alex-r1 B04, paul-r7 B02): quand le user force
   * une technique incoherente avec le micro-cadre, le visible agent recoit
   * un signal STRUCTURE au lieu d'une doctrine noyee — le doute sort.
   */
  technique_coherence?: {
    status: "coherent" | "forced_mismatch";
    requested_technique: string | null;
    suggested_technique: string | null;
    why: string | null;
  } | null;
};

export type DifficultyClarifierStepContext = {
  /** @deprecated Legacy step context; use change_confirm_coaching_type or a typed coaching agent. */
  task_kind: "ask_difficulty_clarification";
  objective: string;
  missing_fields: string[];
  known_values: Record<string, unknown>;
  question_goal: string;
  output_constraints: {
    max_questions: 1;
    no_recommendation: true;
  };
};

export type CauseExplanationStepContext = {
  /** @deprecated Legacy step context; explanation now belongs inside the typed coaching agents. */
  task_kind: "explain_cause";
  objective: string;
  difficulty_summary: string;
  cause_hypothesis: string;
  contrast_with_wrong_causes: string[];
};

export type FeatureRecommendationStepContext = {
  /** @deprecated Legacy step context; use action_plan_coaching, no_plan_coaching, or emotion_coaching. */
  task_kind: "recommend_feature";
  objective: string;
  selected_feature: CoachingFeatureSuggestion;
  secondary_feature: CoachingFeatureSuggestion | null;
  why_selected: string;
  why_not_others: Partial<Record<CoachingFeatureSuggestion, string>>;
  priority_features: CoachingFeatureSuggestion[];
};

export type PlatformGuidanceStepContext = {
  /** @deprecated Legacy step context; product guidance is injected into the typed coaching agents. */
  task_kind: "explain_platform_destination";
  objective: string;
  feature: CoachingFeatureSuggestion;
  destination_label: string;
  user_facing_destination: string;
  next_step: string;
  product_guidance: CoachingFeatureProductGuidance | null;
};

export type ChangeConfirmCoachingTypeStepContext = {
  task_kind: "change_confirm_coaching_type";
  objective: string;
  current_coaching_type: CoachingType;
  candidate_coaching_type: CoachingType | null;
  missing_or_weak_values: string[];
  confirmation_question: string;
};

export type EmotionCoachingStepContext = {
  task_kind: "emotion_coaching";
  objective: string;
  state_hint: string | null;
  intensity: "low" | "medium" | "high" | null;
  selected_feature: "state_potion" | null;
  why_selected: string | null;
  product_guidance: CoachingFeatureProductGuidance | null;
};

export type NoPlanCoachingStepContext = {
  task_kind: "no_plan_coaching";
  objective: string;
  action_title: string | null;
  action_source: "free" | "ambiguous" | "none";
  cause: CoachingCauseAnalysis["primary_cause"];
  selected_feature: "attack_card" | "defense_card" | null;
  secondary_feature: "attack_card" | "defense_card" | null;
  product_guidance: Partial<
    Record<"attack_card" | "defense_card", CoachingFeatureProductGuidance>
  >;
  coaching_move:
    | "clarify_outcome"
    | "first_step"
    | "avoidance_plan"
    | "risk_preparation"
    | "emotional_grounding";
  why_not_platform_feature: string;
  suggested_next_step: string;
};

export type ActionPlanCoachingStepContext = {
  task_kind: "action_plan_coaching";
  objective: string;
  plan_item_id: string;
  action_title: string | null;
  selected_feature: Exclude<CoachingFeatureSuggestion, "state_potion"> | null;
  secondary_feature: Exclude<CoachingFeatureSuggestion, "state_potion"> | null;
  why_selected: string | null;
  platform_destination: CoachingRecommendationDecision["platform_destination"];
  product_guidance: Partial<
    Record<
      Exclude<CoachingFeatureSuggestion, "state_potion">,
      CoachingFeatureProductGuidance
    >
  >;
};

export type CloseOrFollowupStepContext = {
  task_kind: "answer_followup" | "close_recommendation";
  objective: string;
  last_answer_summary: string | null;
  current_recommendation: CoachingRecommendationDecision;
};

export type ExitOrTransitionStepContext = {
  task_kind: "exit_ack";
  objective: string;
};

export type CoachingVisibleStepContext =
  | ChangeConfirmCoachingTypeStepContext
  | EmotionCoachingStepContext
  | NoPlanCoachingStepContext
  | ActionPlanCoachingStepContext
  | DifficultyClarifierStepContext
  | CauseExplanationStepContext
  | FeatureRecommendationStepContext
  | PlatformGuidanceStepContext
  | CloseOrFollowupStepContext
  | ExitOrTransitionStepContext;

export type CoachingRecommendationLocalState = {
  stage:
    | "understand_need"
    | "compare_options"
    | "recommend"
    | "followup"
    | "closing";
  user_need_summary: string | null;
  candidate_features: CoachingFeatureCandidate[];
  current_recommendation: CoachingFeatureCandidate | null;
  secondary_recommendation: CoachingFeatureCandidate | null;
  unresolved_question: string | null;
  last_answer_summary: string | null;
  parent_flow_id:
    | "daily_action_review_v1"
    | "weekly_adaptive_review_v1"
    | null;
  parent_return_focus: string | null;
  parent_action_context: Record<string, unknown> | null;
  parent_state_summary: string | null;
  coaching_type?: CoachingType;
  coaching_type_confidence?: "low" | "medium" | "high";
  coaching_type_evidence?: string[];
  pending_type_change?: {
    candidate_coaching_type: CoachingType;
    reason: string | null;
  } | null;
  dispatcher_signal_context: CoachingRecommendationSignalContext | null;
  difficulty: CoachingDifficulty | null;
  cause_analysis: CoachingCauseAnalysis | null;
  recommendation_decision: CoachingRecommendationDecision | null;
  last_visible_decision?: CoachingVisibleDecision | null;
  last_visible_task_kind: CoachingVisibleStepContext["task_kind"] | null;
  /**
   * Cliquet handoff produit (paul-triflow15 B03): passe a true au premier tour
   * ou le user ordonne la creation de la carte et ou le handoff (destination +
   * frontiere write-en-chat) a ete rendu. Tant que le flow vit, un nouvel ordre
   * de creation ne redeclenche JAMAIS une re-explication de la definition.
   */
  materialization_handoff_done?: boolean;
  turn_count: number;
  max_turns: number;
};

export type CoachingRecommendationConversationContext = {
  state_summary: string;
  coaching_category: CoachingRecommendationCategory | null;
  failure_mode: CoachingFailureMode | null;
  action_context: CoachingRecommendationSignalContext["action_context"] | null;
  priority_features: CoachingFeatureSuggestion[];
  known_values: Record<string, unknown>;
  missing_or_weak_values: string[];
  candidate_features: CoachingFeatureCandidate[];
  recommendation: {
    primary_feature: CoachingFeatureSuggestion | null;
    secondary_feature: CoachingFeatureSuggestion | null;
    why_primary: string | null;
    user_facing_next_step: string | null;
  };
  tone_constraints: string[];
  do_not_say: string[];
  evidence_used: string[];
};

export type CoachingTargetSwitch = {
  status: "none" | "explicit" | "ambiguous";
  to_coaching_type: CoachingType | null;
  target: {
    kind: "plan_action" | "free_action" | "emotional_state" | null;
    title: string | null;
    source: "plan" | "free" | "none" | "ambiguous";
    plan_item_id: string | null;
  } | null;
};

export type CoachingRecommendationLocalDispatcherOutput = {
  flow_action: CoachingRecommendationFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  coaching_intent: {
    kind: CoachingIntentKind;
    summary: string;
  };
  target_switch: CoachingTargetSwitch;
  feature_candidates: CoachingFeatureCandidate[];
  recommendation: {
    primary_feature: CoachingFeatureSuggestion | null;
    secondary_feature: CoachingFeatureSuggestion | null;
    why_primary: string | null;
    user_facing_next_step: string | null;
  };
  direct_effect_request: LocalOneShotDirectEffectRequest;
  state_updates: {
    stage: CoachingRecommendationLocalState["stage"];
    status: "active" | "closing" | "closed" | "exit_to_global";
    turn_count_increment: number;
    close_after_visible: boolean;
    materialization_handoff_done?: boolean;
  };
  visible_task: {
    kind: CoachingRecommendationVisibleTaskKind;
    instruction: string;
    conversation_context: CoachingRecommendationConversationContext;
    flow_context?: CoachingRecommendationFlowContext;
    step_context?: CoachingVisibleStepContext;
  };
  note_information: NoteInformation | null;
  exit_memo: {
    needed: boolean;
    reason:
      | "topic_change"
      | "safety"
      | "complete"
      | "unknown"
      | "none";
    user_intent_summary: string | null;
    local_flow_context: {
      skill_id: "coaching_recommendation";
      stage: string | null;
      user_need_summary: string | null;
      candidate_features: CoachingFeatureCandidate[];
      current_recommendation: string | null;
      last_answer_summary: string | null;
    };
    handoff_hint_for_global_dispatcher: {
      likely_intent:
        | "normal_reply"
        | "unknown";
      why: string | null;
    };
  };
  evidence: string[];
};

export type CoachingRecommendationReducerResult = {
  status: "continue" | "complete" | "exit";
  reason_code: string;
  diagnosis: {
    flow_action: CoachingRecommendationFlowAction;
    visible_task: CoachingRecommendationVisibleTaskKind;
    target_switch: CoachingTargetSwitch;
    previous_coaching_type: CoachingType | null;
    candidate_coaching_type: CoachingType | null;
    target_switch_applied: boolean;
    exit_rejected_reason: string | null;
  };
  local_state: CoachingRecommendationLocalState | null;
  visible_task: CoachingRecommendationVisibleTaskKind;
  conversation_context: CoachingRecommendationConversationContext;
  flow_context: CoachingRecommendationFlowContext;
  step_context: CoachingVisibleStepContext;
  note_information: NoteInformation | null;
  effects: {
    requested: [];
    allowed: [];
    blocked: Array<{ type: string; reason_code: string }>;
    committed: [];
  };
};

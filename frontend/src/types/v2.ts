// Shared V2/V3 types mirrored between backend and frontend.

// Section 2 - Enums canoniques

export type CycleStatus =
  | "draft"
  | "clarification_needed"
  | "structured"
  | "prioritized"
  | "questionnaire_in_progress"
  | "signup_pending"
  | "profile_pending"
  | "ready_for_plan"
  | "active"
  | "completed"
  | "abandoned";

export type CycleDraftStatus =
  | "draft"
  | "structured"
  | "prioritized"
  | "expired";

export type TransformationStatus =
  | "draft"
  | "ready"
  | "pending"
  | "active"
  | "completed"
  | "abandoned"
  | "cancelled"
  | "archived";

export type TransformationAspectStatus =
  | "active"
  | "deferred"
  | "rejected";

export type TransformationAspectUncertainty =
  | "low"
  | "medium"
  | "high";

export type DeferredReason =
  | "not_priority_now"
  | "later_cycle"
  | "out_of_scope"
  | "user_choice"
  | "unclear";

export type PlanStatus =
  | "draft"
  | "generated"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type PlanDimension =
  | "clarifications"
  | "support"
  | "missions"
  | "habits";

export type PlanItemKind =
  | "framework"
  | "exercise"
  | "task"
  | "milestone"
  | "habit";

export type PlanItemStatus =
  | "pending"
  | "active"
  | "in_maintenance"
  | "completed"
  | "deactivated"
  | "cancelled"
  | "stalled";

export type SupportMode =
  | "always_available"
  | "recommended_now"
  | "unlockable";

export type SupportFunction =
  | "practice"
  | "rescue"
  | "understanding";

export type HabitState =
  | "active_building"
  | "in_maintenance"
  | "stalled";

export type TrackingType =
  | "boolean"
  | "count"
  | "scale"
  | "text"
  | "milestone";

export type MetricScope =
  | "cycle"
  | "transformation";

export type MetricKind =
  | "north_star"
  | "progress_marker"
  | "support_metric"
  | "custom";

export type MetricStatus =
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type MomentumStateLabel =
  | "momentum"
  | "friction_legere"
  | "evitement"
  | "pause_consentie"
  | "soutien_emotionnel"
  | "reactivation";

export type MomentumPosture =
  | "push_lightly"
  | "simplify"
  | "hold"
  | "support"
  | "reopen_door"
  | "reduce_load"
  | "repair";

export type ConfidenceLevel =
  | "low"
  | "medium"
  | "high";

export type ProactiveBudgetClass =
  | "silent"
  | "light"
  | "notable";

export type ProactiveWindowKind =
  | "morning_presence"
  | "pre_event_grounding"
  | "midday_rescue"
  | "evening_reflection_light"
  | "reactivation_window";

export type ProactiveWindowDecision =
  | "create_window"
  | "reschedule_window"
  | "cancel_window"
  | "downgrade_to_soft_presence"
  | "skip";

export type MorningNudgePosture =
  | "protective_pause"
  | "support_softly"
  | "pre_event_grounding"
  | "open_door"
  | "simplify_today"
  | "focus_today"
  | "celebration_ping";

export type CooldownType =
  | "same_posture"
  | "same_item_reminded"
  | "failed_technique"
  | "refused_rendez_vous"
  | "reactivation_after_silence";

export type DominantNeedKind =
  | "pre_event"
  | "emotional_protection"
  | "load_relief"
  | "traction_rescue"
  | "reactivation"
  | "general_presence";

export type RelationPreferenceContactWindow =
  | "morning"
  | "afternoon"
  | "evening";

export type RendezVousKind =
  | "pre_event_grounding"
  | "post_friction_repair"
  | "weekly_reset"
  | "mission_preparation"
  | "transition_handoff";

export type RendezVousState =
  | "draft"
  | "scheduled"
  | "delivered"
  | "skipped"
  | "cancelled"
  | "completed";

export type DailyBilanMode =
  | "check_light"
  | "check_supportive"
  | "check_blocker"
  | "check_progress";

export type WeeklyDecision =
  | "hold"
  | "expand"
  | "consolidate"
  | "reduce";

export type LabSurfaceSource =
  | "manual"
  | "prefill_plan"
  | "prefill_classification"
  | "system";

export type LabSurfaceStatus =
  | "draft"
  | "suggested"
  | "active"
  | "archived";

export type LabScopeKind =
  | "transformation"
  | "out_of_plan"
  | "plan_item";

export type InspirationEffortLevel =
  | "light"
  | "medium"
  | "high";

export type InspirationContextWindow =
  | "anytime"
  | "morning"
  | "afternoon"
  | "evening"
  | "during_friction";

export type PotionType =
  | "rappel"
  | "courage"
  | "guerison"
  | "clarte"
  | "amour"
  | "apaisement";

export type PotionSessionStatus =
  | "completed"
  | "archived";

export type PotionFollowUpMode =
  | "none"
  | "recommended_later"
  | "suggested_series"
  | "scheduled_series";

export type Phase1RuntimeStatus =
  | "pending"
  | "in_progress"
  | "completed";

export type Phase1RecommendedLabObject =
  | "defense_card"
  | "attack_card"
  | "support_card";

export type Phase1RecommendedInspiration =
  | "story"
  | "deep_why"
  | "japanese_principles";

export type BaseDeVieDeclics = {
  why: string;
  insight: string;
  identity_shift: string;
};

export type BaseDeVieLineEntry = {
  action: string;
  why: string;
};

export type TransformationClosureImprovementReason =
  | "plan_unclear"
  | "pace_too_intense"
  | "actions_too_hard"
  | "actions_not_real_life"
  | "sophia_not_helpful_moment"
  | "progress_not_visible"
  | "need_more_support"
  | "other";

export type TransformationClosureHelpfulnessArea =
  | "habits"
  | "one_off_actions"
  | "sophia_messages"
  | "plan_structure"
  | "progress_tracking"
  | "other";

export type TransformationClosureFeedback = {
  helpfulness_rating: number;
  improvement_reasons: TransformationClosureImprovementReason[];
  improvement_detail: string | null;
  most_helpful_area: TransformationClosureHelpfulnessArea;
};

export type UserTransformationBaseDeViePayload = {
  line_red_entries: string[];
  line_green_entry: BaseDeVieLineEntry | null;
  line_red_entry: BaseDeVieLineEntry | null;
  declics_draft: BaseDeVieDeclics | null;
  declics_user: BaseDeVieDeclics | null;
  closure_feedback: TransformationClosureFeedback | null;
  validated_at: string | null;
  last_edited_at: string | null;
};

// Section 3 - Tables cibles

export type UserCycleRow = {
  id: string;
  user_id: string;
  status: CycleStatus;
  raw_intake_text: string;
  intake_language: string | null;
  validated_structure: Record<string, unknown> | null;
  duration_months: number | null;
  birth_date_snapshot: string | null;
  gender_snapshot: string | null;
  requested_pace: "cool" | "normal" | "intense" | null;
  active_transformation_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
};

export type UserCycleDraftRow = {
  id: string;
  anonymous_session_id: string;
  status: CycleDraftStatus;
  raw_intake_text: string;
  draft_payload: Record<string, unknown>;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type UserTransformationRow = {
  id: string;
  cycle_id: string;
  priority_order: number;
  status: TransformationStatus;
  title: string | null;
  internal_summary: string;
  user_summary: string;
  success_definition: string | null;
  main_constraint: string | null;
  ordering_rationale?: string | null;
  questionnaire_schema: Record<string, unknown> | null;
  questionnaire_answers: Record<string, unknown> | null;
  completion_summary: string | null;
  handoff_payload: Record<string, unknown> | null;
  base_de_vie_payload: UserTransformationBaseDeViePayload | null;
  unlocked_principles: Record<string, boolean> | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  completed_at: string | null;
};

export type UserTransformationAspectRow = {
  id: string;
  cycle_id: string;
  transformation_id: string | null;
  label: string;
  raw_excerpt: string | null;
  status: TransformationAspectStatus;
  uncertainty_level: TransformationAspectUncertainty;
  deferred_reason: DeferredReason | null;
  source_rank: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UserPlanV2Row = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  status: PlanStatus;
  version: number;
  title: string | null;
  content: Record<string, unknown>;
  generation_attempts: number;
  last_generation_reason: string | null;
  generation_feedback: string | null;
  generation_input_snapshot: Record<string, unknown> | null;
  activated_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserPlanItemRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  dimension: PlanDimension;
  kind: PlanItemKind;
  status: PlanItemStatus;
  title: string;
  description: string | null;
  tracking_type: TrackingType;
  activation_order: number | null;
  activation_condition: Record<string, unknown> | null;
  current_habit_state: HabitState | null;
  support_mode: SupportMode | null;
  support_function: SupportFunction | null;
  target_reps: number | null;
  current_reps: number | null;
  cadence_label: string | null;
  scheduled_days: string[] | null;
  time_of_day: string | null;
  start_after_item_id: string | null;
  phase_id: string | null;
  phase_order?: number | null;
  defense_card_id?: string | null;
  attack_card_id?: string | null;
  cards_status?: "not_required" | "not_started" | "generating" | "ready" | "failed";
  cards_generated_at?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  completed_at: string | null;
};

export type UserPlanItemEntryRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  entry_kind:
    | "checkin"
    | "progress"
    | "skip"
    | "partial"
    | "blocker"
    | "support_feedback";
  outcome: string;
  value_numeric: number | null;
  value_text: string | null;
  difficulty_level: "low" | "medium" | "high" | null;
  blocker_hint: string | null;
  created_at: string;
  effective_at: string;
  metadata: Record<string, unknown>;
};

export type UserMetricRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string | null;
  scope: MetricScope;
  kind: MetricKind;
  status: MetricStatus;
  title: string;
  unit: string | null;
  current_value: string | null;
  target_value: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UserVictoryLedgerRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string | null;
  plan_item_id: string | null;
  title: string;
  summary: string;
  confidence: ConfidenceLevel;
  source_kind: "daily" | "weekly" | "chat" | "system";
  created_at: string;
  metadata: Record<string, unknown>;
};

export type UserRelationPreferencesRow = {
  user_id: string;
  preferred_contact_windows: RelationPreferenceContactWindow[] | null;
  disliked_contact_windows: RelationPreferenceContactWindow[] | null;
  preferred_tone: "gentle" | "direct" | "mixed" | null;
  preferred_message_length: "short" | "medium" | null;
  max_proactive_intensity: "low" | "medium" | "high" | null;
  soft_no_contact_rules: Record<string, unknown> | null;
  updated_at: string;
};

export type UserRendezVousRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string | null;
  kind: RendezVousKind;
  state: RendezVousState;
  budget_class: ProactiveBudgetClass;
  trigger_reason: string;
  confidence: ConfidenceLevel;
  scheduled_for: string | null;
  posture: "gentle" | "supportive" | "preparatory" | "repair";
  source_refs: Record<string, unknown>;
  linked_checkin_id: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
};

// Section 3b - Defense Card tables

export type ImpulseTrigger = {
  trigger_id: string;
  label?: string | null;
  difficulty_preview?: string | null;
  illustration?: {
    icon: string;
    palette: string[];
    accent: string;
    scene: string;
  } | null;
  situation: string;
  signal: string;
  defense_response: string;
  plan_b?: string | null;
};

export type DominantImpulse = {
  impulse_id: string;
  label: string;
  triggers: ImpulseTrigger[];
  generic_defense: string;
};

export type DefenseCardContent = {
  impulses: DominantImpulse[];
  difficulty_map_summary?: string | null;
  review?: {
    decision: "allow" | "allow_with_fixes";
    reason_short: string;
    checked_at?: string | null;
  } | null;
};

export type UserDefenseCardRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  scope_kind: LabScopeKind;
  transformation_id: string | null;
  phase_id: string | null;
  plan_item_id?: string | null;
  source?: LabSurfaceSource;
  status?: LabSurfaceStatus;
  content: DefenseCardContent;
  metadata: Record<string, unknown>;
  generated_at: string;
  last_updated_at: string;
};

export type UserDefenseWinRow = {
  id: string;
  defense_card_id: string;
  impulse_id: string;
  trigger_id: string | null;
  source: "quick_log" | "conversation";
  logged_at: string;
};

export type AttackCardContent = {
  summary: string;
  techniques: Array<{
    technique_key:
      | "texte_recadrage"
      | "mantra_force"
      | "ancre_visuelle"
      | "visualisation_matinale"
      | "preparer_terrain"
      | "pre_engagement";
    title: string;
    pour_quoi: string;
    objet_genere: string;
    questions?: string[];
    mode_emploi: string;
    generated_result?: {
      output_title: string;
      generated_asset: string;
      supporting_points?: string[];
      mode_emploi: string;
      generated_at?: string | null;
      keyword_trigger?: {
        activation_keyword: string;
        activation_keyword_normalized: string;
        risk_situation: string;
        strength_anchor: string;
        first_response_intent: string;
        assistant_prompt: string;
      } | null;
    } | null;
  }>;
};

export type SupportCardContent = {
  support_goal: string;
  moments: string[];
  grounding_actions: string[];
  reminder: string;
};

export type UserAttackCardRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  scope_kind: LabScopeKind;
  transformation_id: string | null;
  phase_id: string | null;
  plan_item_id?: string | null;
  source: LabSurfaceSource;
  status: LabSurfaceStatus;
  content: AttackCardContent;
  metadata: Record<string, unknown>;
  generated_at: string;
  last_updated_at: string;
};

export type UserSupportCardRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  scope_kind: LabScopeKind;
  transformation_id: string | null;
  phase_id: string | null;
  source: LabSurfaceSource;
  status: LabSurfaceStatus;
  content: SupportCardContent;
  metadata: Record<string, unknown>;
  generated_at: string;
  last_updated_at: string;
};

export type UserInspirationItemRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  scope_kind: LabScopeKind;
  transformation_id: string | null;
  phase_id: string | null;
  source: LabSurfaceSource;
  status: LabSurfaceStatus;
  inspiration_type: string;
  angle: string | null;
  title: string;
  body: string;
  cta_label: string | null;
  cta_payload: Record<string, unknown>;
  tags: string[];
  effort_level: InspirationEffortLevel;
  context_window: InspirationContextWindow;
  metadata: Record<string, unknown>;
  generated_at: string;
  last_updated_at: string;
};

export type PotionQuestionOption = {
  value: string;
  label: string;
};

export type PotionQuestion = {
  id: string;
  label: string;
  helper_text: string | null;
  input_type: "single_select" | "free_text";
  options: PotionQuestionOption[];
  placeholder?: string | null;
  required: boolean;
};

export type PotionFollowUpStrategy = {
  mode: PotionFollowUpMode;
  rationale: string | null;
  suggested_delay_hours: number | null;
  suggested_duration_days?: number | null;
  scheduled_local_time_hhmm?: string | null;
  scheduled_duration_days?: number | null;
  scheduled_message_count?: number | null;
  scheduled_at?: string | null;
  linked_recurring_reminder_id?: string | null;
};

export type PotionDefinition = {
  type: PotionType;
  title: string;
  short_description: string;
  state_trigger: string[];
  effect_goal: string[];
  questionnaire: PotionQuestion[];
  free_text_label: string;
  free_text_placeholder: string;
  free_text_required: boolean;
  default_follow_up_strategy: PotionFollowUpStrategy;
};

export type PotionFollowUpProposal = {
  title: string;
  description: string;
  message_text: string;
  cadence_hint: string | null;
};

export type PotionActivationContent = {
  potion_name: string;
  instant_response: string;
  suggested_next_step: string | null;
  follow_up_proposal: PotionFollowUpProposal | null;
};

export type ClarificationExerciseType =
  | "one_shot"
  | "recurring";

export type ClarificationSectionInputType =
  | "text"
  | "textarea"
  | "scale"
  | "list"
  | "categorized_list";

export type ClarificationExerciseSection = {
  id: string;
  label: string;
  input_type: ClarificationSectionInputType;
  placeholder: string | null;
  helper_text: string | null;
};

export type ClarificationExerciseDetails = {
  type: ClarificationExerciseType;
  intro: string;
  save_label: string | null;
  sections: ClarificationExerciseSection[];
};

export type UserFrameworkEntryRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  action_id: string;
  framework_title: string;
  framework_type: string;
  content: Record<string, unknown>;
  schema_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  submission_id: string | null;
  target_reps: number | null;
};

export type UserPotionSessionRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  scope_kind: LabScopeKind;
  transformation_id: string | null;
  phase_id: string | null;
  potion_type: PotionType;
  source: LabSurfaceSource;
  status: PotionSessionStatus;
  questionnaire_schema: PotionQuestion[];
  questionnaire_answers: Record<string, string>;
  free_text: string | null;
  content: PotionActivationContent;
  follow_up_strategy: PotionFollowUpStrategy;
  metadata: Record<string, unknown>;
  generated_at: string;
  last_updated_at: string;
};

export type RepairModeState = {
  version: 1;
  active: boolean;
  entered_at: string | null;
  reason: string | null;
  source: "router" | "watcher" | "process_checkins" | "system";
  reopen_signals_count: number;
  last_soft_contact_at: string | null;
};

export type SystemRuntimeSnapshotRow = {
  id: string;
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  /** Accepts original 5 snapshot types + all V2 event types + Phase A cooldown_entry. */
  snapshot_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

// Section 5 - JSON / state shapes canoniques

export type PlanContentV2 = {
  version: 2;
  cycle_id: string;
  transformation_id: string;
  duration_months: number;
  title: string;
  user_summary: string;
  internal_summary: string;
  strategy: {
    identity_shift: string | null;
    core_principle: string | null;
    success_definition: string | null;
    main_constraint: string | null;
  };
  dimensions: Array<{
    id: PlanDimension;
    title: string;
    items: Array<PlanContentItem>;
  }>;
  journey_context?: {
    is_multi_part: boolean;
    part_number: number | null;
    estimated_total_parts: number | null;
    continuation_hint: string | null;
    estimated_total_duration_months: number | null;
    parts?: Array<{
      transformation_id: string;
      title: string | null;
      part_number: number;
      estimated_duration_months: number | null;
      status: TransformationStatus | null;
    }>;
  } | null;
  timeline_summary: string | null;
  metadata: Record<string, unknown>;
};

export type PlanContentItem = {
  temp_id: string;
  dimension: PlanDimension;
  kind: PlanItemKind;
  title: string;
  description: string;
  tracking_type: TrackingType;
  activation_order: number | null;
  activation_condition: Record<string, unknown> | null;
  support_mode: SupportMode | null;
  support_function: SupportFunction | null;
  target_reps: number | null;
  cadence_label: string | null;
  scheduled_days: string[] | null;
  time_of_day: string | null;
  payload: Record<string, unknown> & {
    clarification_details?: ClarificationExerciseDetails;
  };
};

// Section 5b - V3 plan shapes (phases + Heartbeat)

export type HeartbeatMetric = {
  title: string;
  unit: string;
  current: number | null;
  target: number;
  tracking_mode: "manual" | "inferred";
};

export type PlanLevelWeekStatus =
  | "completed"
  | "current"
  | "upcoming";

export type PlanLevelWeekItemAssignment = {
  temp_id: string;
  weekly_reps?: number | null;
  weekly_description_override?: string | null;
  weekly_cadence_label?: string | null;
};

export type PlanLevelWeek = {
  week_order: number;
  title: string;
  focus?: string | null;
  weekly_target_value?: number | null;
  weekly_target_label?: string | null;
  progression_note?: string | null;
  action_focus?: string[];
  item_assignments?: PlanLevelWeekItemAssignment[] | null;
  reps_summary: string | null;
  mission_days: string[];
  success_signal: string | null;
  status?: PlanLevelWeekStatus;
};

export type PlanBlueprintLevel = {
  phase_id: string;
  level_order: number;
  title: string;
  intention: string;
  estimated_duration_weeks: number;
  preview_summary: string | null;
  status?: "completed" | "current" | "upcoming";
};

export type PlanBlueprint = {
  global_objective: string;
  estimated_levels_count: number;
  levels: PlanBlueprintLevel[];
};

export type CurrentLevelRuntime = {
  phase_id: string;
  level_order: number;
  title: string;
  phase_objective: string;
  rationale: string;
  what_this_phase_targets?: string | null;
  why_this_now?: string | null;
  how_this_phase_works?: string | null;
  duration_weeks: number;
  phase_metric_target?: string | null;
  maintained_foundation: string[];
  heartbeat: HeartbeatMetric;
  weeks: PlanLevelWeek[];
  review_focus: string[];
};

export type LevelReviewInputType =
  | "single_select"
  | "free_text";

export type LevelReviewQuestionOption = {
  value: string;
  label: string;
};

export type LevelReviewQuestion = {
  id: string;
  label: string;
  helper_text: string | null;
  input_type: LevelReviewInputType;
  options: LevelReviewQuestionOption[];
  placeholder?: string | null;
  required: boolean;
};

export type LevelReviewAnswerMap = Record<string, string>;

export type LevelTransitionDecision =
  | "keep"
  | "shorten"
  | "extend"
  | "lighten";

export type LevelReviewSummary = {
  level_kind: "clarity" | "mission" | "habit" | "hybrid";
  pace_signal: "too_light" | "balanced" | "too_heavy";
  readiness_signal: "need_more_time" | "ready" | "very_ready";
  weekly_fit_signal?: "clear" | "uneven" | "too_dense" | null;
  mission_signal?: "good" | "move_some" | "lighten_some" | null;
  habit_signal?: "keep" | "lighten" | "unstable" | null;
  support_signal?: "enough" | "need_more" | "need_less" | null;
  free_text: string | null;
};

export type LevelTransitionPreview = {
  decision: LevelTransitionDecision;
  reason: string;
  next_duration_weeks: number | null;
  next_review_focus: string[];
};

export type PlanPhase = {
  phase_id: string;
  phase_order: number;
  title: string;
  rationale: string;
  phase_objective: string;
  duration_guidance?: string;
  duration_weeks?: number | null;
  what_this_phase_targets?: string | null;
  why_this_now?: string | null;
  how_this_phase_works?: string | null;
  phase_metric_target?: string | null;
  maintained_foundation: string[];
  heartbeat: HeartbeatMetric;
  weeks?: PlanLevelWeek[] | null;
  items: PlanContentItem[];
};

export type PlanTypeClassificationV1 = {
  type_key: string;
  confidence: number;
  duration_guidance: {
    min_months: number;
    default_months: number;
    max_months: number;
  };
  transformation_length_level?: number;
  recommended_phase_count?: {
    min: number;
    max: number;
  };
  intensity_profile?: {
    pace: "gentle" | "steady" | "assertive";
    rationale: string;
  };
  journey_strategy?: {
    mode: "single_transformation" | "two_transformations";
    rationale: string;
    total_estimated_duration_months: number;
    transformation_1_title: string;
    transformation_1_goal: string;
    transformation_2_title: string | null;
    transformation_2_goal: string | null;
  };
  split_metric_guidance?: {
    metric_label: string | null;
    transformation_1: {
      baseline_text: string;
      target_text: string;
      success_definition: string;
    };
    transformation_2: {
      baseline_text: string;
      target_text: string;
      success_definition: string;
    } | null;
  } | null;
  sequencing_notes?: string[];
  plan_style: string[];
  recommended_metrics: string[];
  framing_to_avoid: string[];
  first_steps_examples: string[];
  secondary_type_keys?: string[];
  difficulty_patterns?: string[];
  support_bias?: string[];
  forbidden_actions?: string[];
};

export type ProfessionalSupportKey =
  | "general_practitioner"
  | "sports_physician"
  | "dietitian"
  | "nutrition_physician"
  | "endocrinologist"
  | "cardiologist"
  | "gastroenterologist"
  | "sleep_specialist"
  | "ent_specialist"
  | "urologist"
  | "andrologist"
  | "gynecologist"
  | "midwife"
  | "fertility_specialist"
  | "sexologist"
  | "physiotherapist"
  | "pelvic_floor_physio"
  | "pain_specialist"
  | "psychologist"
  | "psychotherapist"
  | "psychiatrist"
  | "cbt_therapist"
  | "neuropsychologist"
  | "addiction_specialist"
  | "smoking_cessation_specialist"
  | "couples_therapist"
  | "relationship_counselor"
  | "family_mediator"
  | "sports_coach"
  | "strength_conditioning_coach"
  | "yoga_pilates_teacher"
  | "occupational_therapist"
  | "adhd_coach"
  | "career_coach"
  | "work_psychologist"
  | "executive_coach"
  | "speech_coach"
  | "budget_counselor"
  | "debt_advisor"
  | "social_worker"
  | "lawyer"
  | "notary";

export type ProfessionalSupportRecommendationLevel =
  | "optional"
  | "recommended";

export type ProfessionalSupportRecommendation = {
  key: ProfessionalSupportKey;
  reason: string;
  priority_rank?: number | null;
  timing_kind?: ProfessionalSupportTimingKind | null;
  target_phase_id?: string | null;
  target_level_order?: number | null;
  timing_reason?: string | null;
};

export type ProfessionalSupportV1 = {
  should_recommend: boolean;
  recommendation_level: ProfessionalSupportRecommendationLevel;
  summary: string | null;
  recommendations: ProfessionalSupportRecommendation[];
};

export type ProfessionalSupportTimingKind =
  | "now"
  | "after_phase1"
  | "during_target_level"
  | "before_next_level"
  | "if_blocked";

export type ProfessionalSupportRecommendationStatus =
  | "pending"
  | "not_needed"
  | "booked"
  | "completed";

export type UserProfessionalSupportRecommendationRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  professional_key: ProfessionalSupportKey;
  priority_rank: number;
  recommendation_level: ProfessionalSupportRecommendationLevel;
  summary: string | null;
  reason: string;
  timing_kind: ProfessionalSupportTimingKind;
  target_phase_id: string | null;
  target_level_order: number | null;
  timing_reason: string;
  status: ProfessionalSupportRecommendationStatus;
  is_active: boolean;
  metadata: Record<string, unknown>;
  generated_at: string;
  updated_at: string;
};

export type ProfessionalSupportEventType =
  | "generated"
  | "dismissed_not_needed"
  | "marked_booked"
  | "marked_completed"
  | "retimed_after_plan_change";

export type UserProfessionalSupportEventRow = {
  id: string;
  recommendation_id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  event_type: ProfessionalSupportEventType;
  payload: Record<string, unknown>;
  created_at: string;
};

export type ToolRecommendationType =
  | "app"
  | "product";

export type ToolRecommendationCategoryKey =
  | "measurement_tracking"
  | "symptom_tracking"
  | "sleep_support"
  | "nutrition_prep"
  | "hydration_support"
  | "movement_training"
  | "recovery_mobility"
  | "pain_relief_support"
  | "distraction_blocking"
  | "reproductive_health"
  | "consumption_reduction"
  | "workspace_ergonomics";

export type ToolRecommendationStatus =
  | "recommended"
  | "installed"
  | "purchased"
  | "already_owned"
  | "not_relevant";

export type LevelToolRecommendationSupersededReason =
  | "level_rewritten"
  | "level_removed"
  | "regenerated_after_plan_change"
  | "level_recommendation_set_changed";

export type LevelSnapshot = {
  level_id: string;
  level_order: number;
  level_title: string;
  level_objective: string;
  what_this_level_targets: string | null;
  why_this_now: string | null;
  how_this_level_works: string | null;
};

export type UserLevelToolRecommendationRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_version: number;
  plan_updated_at: string;
  target_level_id: string | null;
  target_level_order: number;
  priority_rank: number;
  tool_type: ToolRecommendationType;
  category_key: ToolRecommendationCategoryKey;
  subcategory_key: string | null;
  display_name: string;
  brand_name: string | null;
  reason: string;
  why_this_level: string;
  confidence_score: number;
  status: ToolRecommendationStatus;
  is_active: boolean;
  superseded_by_recommendation_id: string | null;
  superseded_reason: LevelToolRecommendationSupersededReason | null;
  level_snapshot: LevelSnapshot;
  metadata: Record<string, unknown>;
  generated_at: string;
  updated_at: string;
};

export type LevelToolRecommendationEventType =
  | "generated"
  | "marked_installed"
  | "marked_purchased"
  | "marked_already_owned"
  | "marked_not_relevant"
  | "superseded_after_plan_adjustment"
  | "regenerated_after_plan_adjustment";

export type UserLevelToolRecommendationEventRow = {
  id: string;
  recommendation_id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  event_type: LevelToolRecommendationEventType;
  payload: Record<string, unknown>;
  created_at: string;
};

export type LevelToolRecommendationState = {
  version: 1;
  plan_id: string;
  plan_version: number;
  plan_updated_at: string;
  generated_at: string;
  levels: Array<{
    target_level_id: string | null;
    target_level_order: number;
    recommendation_count: number;
    no_recommendation_reason: string | null;
  }>;
};

export type Phase1Context = {
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_type_classification: PlanTypeClassificationV1 | null;
  transformation_summary: string;
  global_objective: string;
  phase_1_objective: string | null;
  phase_1_heartbeat: string | null;
  recommended_lab_objects: Phase1RecommendedLabObject[];
  recommended_inspirations: Phase1RecommendedInspiration[];
  created_at: string;
};

export type Phase1Runtime = {
  status: Phase1RuntimeStatus;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  story_viewed_or_validated: boolean;
  deep_why_answered: boolean;
  defense_card_ready: boolean;
  attack_card_ready: boolean;
  support_card_ready: boolean;
};

export type Phase1LabState = {
  prepared_at: string | null;
  defense_revealed_at?: string | null;
  attack_revealed_at?: string | null;
  support_card_suggested: boolean;
  support_card_reason: string | null;
  defense_card_id: string | null;
  attack_card_id: string | null;
  support_card_id: string | null;
  defense_candidates?: Array<{
    card_id: string;
    title: string;
    rationale: string | null;
    selection_state: "pending" | "selected" | "not_selected";
  }>;
  attack_candidates?: Array<{
    card_id: string;
    title: string;
    rationale: string | null;
    selection_state: "pending" | "selected" | "not_selected";
  }>;
};

export type Phase1DeepWhyQuestion = {
  id: string;
  question: string;
  suggested_answers: string[];
};

export type Phase1DeepWhyAnswer = {
  question_id: string;
  question: string;
  answer: string;
  answered_at: string;
};

export type Phase1DeepWhyState = {
  prepared_at: string | null;
  questions: Phase1DeepWhyQuestion[];
  answers: Phase1DeepWhyAnswer[];
};

export type Phase1StoryPrincipleKey =
  | "ikigai"
  | "kaizen"
  | "hara_hachi_bu"
  | "wabi_sabi"
  | "gambaru"
  | "shoshin"
  | "kintsugi"
  | "ma"
  | "zanshin"
  | "mottainai"
  | "sunao"
  | "fudoshin";

export type Phase1StoryPrincipleSection = {
  principle_key: Phase1StoryPrincipleKey;
  title: string;
  meaning: string;
  in_your_story: string;
  concrete_example: string;
};

export type Phase1StoryState = {
  status: "idle" | "ready_to_generate" | "needs_details" | "generated";
  detail_questions: string[];
  details_answer: string | null;
  story_prompt_hints: string[];
  intro: string | null;
  key_takeaway: string | null;
  principle_sections: Phase1StoryPrincipleSection[];
  story: string | null;
  generated_at: string | null;
};

export type Phase1Payload = {
  context: Phase1Context;
  runtime: Phase1Runtime;
  lab: Phase1LabState | null;
  deep_why: Phase1DeepWhyState | null;
  story: Phase1StoryState | null;
};

export type PlanContentV3 = {
  version: 3;
  cycle_id: string;
  transformation_id: string;
  duration_months: number;
  title: string;
  global_objective: string;
  user_summary: string;
  internal_summary: string;
  situation_context?: string | null;
  mechanism_analysis?: string | null;
  key_understanding?: string | null;
  progression_logic?: string | null;
  primary_metric?: {
    label: string;
    unit: string | null;
    baseline_value?: string | null;
    success_target: string;
    measurement_mode:
      | "absolute_value"
      | "count"
      | "frequency"
      | "duration"
      | "score"
      | "milestone"
      | "qualitative";
  } | null;
  strategy: {
    identity_shift: string | null;
    core_principle: string | null;
    success_definition: string;
    main_constraint: string;
  };
  inspiration_narrative: string;
  phases: PlanPhase[];
  plan_blueprint?: PlanBlueprint | null;
  current_level_runtime?: CurrentLevelRuntime | null;
  timeline_summary: string;
  journey_context?: {
    is_multi_part: boolean;
    part_number: number;
    estimated_total_parts: number;
    continuation_hint: string | null;
    estimated_total_duration_months: number | null;
  } | null;
  metadata: Record<string, unknown>;
};

export type ConversationPulse = {
  version: 1;
  generated_at: string;
  window_days: 7;
  last_72h_weight: number;
  tone: {
    dominant: "steady" | "hopeful" | "mixed" | "strained" | "closed";
    emotional_load: "low" | "medium" | "high";
    relational_openness: "open" | "fragile" | "closed";
  };
  trajectory: {
    direction: "up" | "flat" | "down" | "mixed";
    confidence: ConfidenceLevel;
    summary: string;
  };
  highlights: {
    wins: string[];
    friction_points: string[];
    support_that_helped: string[];
    unresolved_tensions: string[];
  };
  signals: {
    top_blocker: string | null;
    likely_need: "push" | "simplify" | "support" | "silence" | "repair";
    upcoming_event: string | null;
    proactive_risk: "low" | "medium" | "high";
  };
  evidence_refs: {
    message_ids: string[];
    event_ids: string[];
  };
};

export type WeeklyConversationDigest = {
  version: 1;
  week_start: string;
  generated_at: string;
  dominant_tone: string;
  tone_evolution: string;
  best_traction_moments: string[];
  closure_fatigue_moments: string[];
  most_real_blockage: string | null;
  support_that_helped: string | null;
  main_risk_next_week: string | null;
  relational_opportunity: string | null;
  confidence: ConfidenceLevel;
  message_count: number;
  active_days: number;
};

export type MomentumStateV2 = {
  version: 2;
  updated_at: string;
  current_state: MomentumStateLabel;
  state_reason: string;
  dimensions: {
    engagement: { level: "high" | "medium" | "low"; reason?: string };
    execution_traction: {
      level: "up" | "flat" | "down" | "unknown";
      reason?: string;
    };
    emotional_load: { level: "low" | "medium" | "high"; reason?: string };
    consent: { level: "open" | "fragile" | "closed"; reason?: string };
    plan_fit: { level: "good" | "uncertain" | "poor"; reason?: string };
    load_balance: {
      level: "balanced" | "slightly_heavy" | "overloaded";
      reason?: string;
    };
  };
  assessment: {
    top_blocker: string | null;
    top_risk: "load" | "avoidance" | "emotional" | "consent" | "drift" | null;
    confidence: ConfidenceLevel;
  };
  active_load: {
    current_load_score: number;
    mission_slots_used: number;
    support_slots_used: number;
    habit_building_slots_used: number;
    needs_reduce: boolean;
    needs_consolidate: boolean;
  };
  posture: {
    recommended_posture: MomentumPosture;
    confidence: ConfidenceLevel;
  };
  blockers: {
    blocker_kind: "mission" | "habit" | "support" | "global" | null;
    blocker_repeat_score: number;
  };
  memory_links: {
    conversation_pulse_id?: string | null;
    upcoming_event_id?: string | null;
    last_useful_support_ids: string[];
    last_failed_technique_ids: string[];
  };
};

export type DailyBilanOutput = {
  mode: DailyBilanMode;
  target_items: string[];
  prompt_shape: {
    max_questions: 3;
    tone: "light" | "supportive" | "direct";
  };
  expected_capture: {
    progress_evidence: boolean;
    difficulty: boolean;
    blocker_hint: boolean;
    support_usefulness: boolean;
    consent_signal: boolean;
  };
  next_actions: {
    update_momentum: boolean;
    trigger_coaching_review: boolean;
    mark_unlock_candidate: boolean;
  };
};

export type WeeklyBilanOutput = {
  decision: WeeklyDecision;
  reasoning: string;
  retained_wins: string[];
  retained_blockers: string[];
  load_adjustments: Array<{
    type: "activate" | "deactivate" | "maintenance" | "replace";
    target_item_id: string;
    reason: string;
  }>;
  coaching_note?: string;
  suggested_posture_next_week:
    | "steady"
    | "lighter"
    | "support_first"
    | "reengage";
};

export type RendezVousRuntime = {
  id: string;
  cycle_id: string;
  transformation_id?: string | null;
  kind: RendezVousKind;
  state: RendezVousState;
  budget_class: ProactiveBudgetClass;
  trigger_reason: string;
  confidence: ConfidenceLevel;
  scheduled_for?: string | null;
  source_refs: {
    event_id?: string | null;
    conversation_pulse_id?: string | null;
    blocker_key?: string | null;
  };
  posture: "gentle" | "supportive" | "preparatory" | "repair";
};

export type MemoryRetrievalIntent =
  | "answer_user_now"
  | "nudge_decision"
  | "daily_bilan"
  | "weekly_bilan"
  | "rendez_vous_or_outreach";

export type MemoryLayerScope =
  | "cycle"
  | "transformation"
  | "execution"
  | "coaching"
  | "relational"
  | "event";

export type MemoryRetrievalContract = {
  intent: MemoryRetrievalIntent;
  layers: MemoryLayerScope[];
  budget_tier: "minimal" | "light" | "medium" | "full";
  max_tokens_hint: number;
};

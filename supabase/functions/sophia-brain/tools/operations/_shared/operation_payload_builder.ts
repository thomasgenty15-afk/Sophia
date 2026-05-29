import type { ConversationChannel } from "../../../contracts/turn_frame.v1.ts";
import type { ProductRecommendation } from "../../../recommendation/recommendation_types.ts";

export type OperationType =
  | "prepare_attack_card"
  | "select_state_potion"
  | "create_recurring_reminder"
  | "prepare_defense_card"
  | "adjust_plan_item"
  | "update_coach_preferences";

export type OperationSourceKind =
  | "direct_user_request"
  | "recommendation_tool";

export type OperationDraftRequest = {
  operation_id: string;
  operation_type: OperationType;
  source: {
    skill_id: string;
    skill_run_id?: string | null;
    recommendation_id: string;
    trigger_message_id: string;
    operation_source: OperationSourceKind;
  };
  user_context: {
    user_id: string;
    timezone: string;
    channel: ConversationChannel;
    locale: "fr";
  };
  diagnosis: {
    blocker_type?: string | null;
    emotional_state?: string[];
    motivation_state?: string | null;
    confidence: number;
    constraints: string[];
  };
  target: {
    plan_item_id?: string | null;
    plan_item_title?: string | null;
    transformation_id?: string | null;
    topic_id?: string | null;
  };
  desired_attack_technique?:
    | "texte_recadrage"
    | "mantra_force"
    | "ancre_visuelle"
    | "visualisation_matinale"
    | "preparer_terrain"
    | "pre_engagement"
    | "unknown";
  desired_attack_keyword?: string | null;
  evidence: {
    current_user_message: string;
    recent_summary?: string | null;
    relevant_memory_items: Array<{
      id: string;
      kind: string;
      summary: string;
      sensitivity_level: "normal" | "sensitive" | "safety";
    }>;
    action_observations?: Array<{
      plan_item_id: string;
      summary: string;
      window: string;
    }>;
  };
  product_constraints: {
    allowed_operations: string[];
    forbidden_operations: string[];
    requires_confirmation: true;
    max_intrusiveness: 1 | 2 | 3 | 4 | 5;
  };
};

export type AttackCardGeneratorInput = {
  operation_type: "prepare_attack_card";
  output_schema: "attack_card_draft_v1";
  target: {
    kind: "plan_item" | "personal_action";
    plan_item_id?: string | null;
    title: string;
    current_instruction?: string | null;
  };
  blocker: {
    type:
      | "avoidance"
      | "procrastination"
      | "action_too_heavy"
      | "unclear_first_step"
      | "low_energy"
      | "friction"
      | "mixed";
    evidence: string[];
    confidence: number;
  };
  desired_attack_angle:
    | "texte_recadrage"
    | "mantra_force"
    | "ancre_visuelle"
    | "visualisation_matinale"
    | "preparer_terrain"
    | "pre_engagement"
    | "unknown";
  activation_keyword?: string | null;
  constraints: string[];
  forbidden: string[];
};

export type PotionSessionSelectorInput = {
  operation_type: "select_state_potion";
  output_schema: "potion_session_draft_v1";
  state: {
    kind:
      | "decrochage"
      | "fear_avoidance"
      | "shame_guilt"
      | "confusion_overload"
      | "self_harshness"
      | "stress_pressure";
    intensity: "low" | "medium" | "high";
    evidence: string[];
  };
  potion_type:
    | "rappel"
    | "courage"
    | "guerison"
    | "clarte"
    | "amour"
    | "apaisement";
  context?: {
    target_hint?: string | null;
    related_plan_item_id?: string | null;
    topic_hint?: string | null;
    timezone?: string | null;
    current_local_date?: string | null;
  };
  details?: {
    required_question_ids: string[];
    answers: Array<{
      question_id: string;
      label: string;
      answer: string;
      evidence: string[];
    }>;
  };
  constraints: string[];
  forbidden: string[];
};

function currentLocalDateForTimezone(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall through to UTC date when the timezone is invalid.
  }
  return new Date().toISOString().slice(0, 10);
}

export type RecurringReminderBuilderInput = {
  operation_type: "create_recurring_reminder";
  output_schema: "recurring_reminder_draft_v1";
  recurrence: {
    frequency: "daily" | "weekly" | "specific_days" | "weekdays" | "custom";
    days?: string[];
    time: string;
    timezone: string;
  };
  reminder_content: {
    message: string;
    subject_hint?: string | null;
  };
  destination: {
    value: "current_plan" | "base_de_vie";
    related_plan_item_id?: string | null;
    target_kind?: "none" | "transformation" | "plan_item" | "action_family";
    target_plan_item_id?: string | null;
    target_action_family_key?: string | null;
    target_generated_temp_id?: string | null;
    target_binding_policy?:
      | "none"
      | "snapshot"
      | "live_action"
      | "live_action_family";
    target_lifecycle_policy?:
      | "independent"
      | "while_target_active"
      | "while_family_in_current_plan";
    target_label?: string | null;
  };
  constraints: string[];
  forbidden: string[];
};

export type DefenseCardGeneratorInput = {
  operation_type: "prepare_defense_card";
  output_schema: "defense_card_draft_v1";
  attachment: {
    kind:
      | "plan_item"
      | "personal_action"
      | "free_risk_context"
      | "recurring_context";
    plan_item_id?: string | null;
    title: string;
  };
  risk_situation: {
    label: string;
    description?: string | null;
    timing_hint?: string | null;
    context_hint?: string | null;
  };
  trigger: {
    type:
      | "temptation"
      | "impulse"
      | "emotional_drop"
      | "social_context"
      | "fatigue"
      | "stress"
      | "habit_loop"
      | "avoidance";
    evidence: string[];
    confidence: number;
  };
  defense_goal:
    | "avoid_relapse"
    | "interrupt_impulse"
    | "protect_action"
    | "leave_context"
    | "reduce_damage";
  defense_response_hint?: {
    strategy_hint:
      | "delay"
      | "leave_context"
      | "replace_action"
      | "contact_support"
      | "environment_block"
      | "self_talk"
      | "unknown";
    value?: string | null;
  };
  constraints: string[];
  forbidden: string[];
};

export type PlanAdjustmentGeneratorInput = {
  operation_type: "adjust_plan_item";
  output_schema: "plan_adjustment_draft_v1";
  scope: {
    kind:
      | "specific_plan_item"
      | "current_level"
      | "current_phase"
      | "future_phase"
      | "whole_plan";
    plan_item_id?: string | null;
    phase_id?: string | null;
    title?: string | null;
    current_summary: string;
  };
  adjustment_type:
    | "reduce"
    | "clarify"
    | "simplify"
    | "split"
    | "pause"
    | "replace"
    | "rebalance";
  reason: {
    type:
      | "too_hard"
      | "too_vague"
      | "too_heavy"
      | "bad_fit"
      | "repeated_failure"
      | "fatigue"
      | "context_changed";
    evidence: string[];
  };
  reason_change?: {
    type: string;
    evidence: string[];
  };
  change_target?: {
    value: string;
    evidence: string[];
  };
  decision_basis?: {
    user_problem: string;
    inferred_need: string;
    confidence: "low" | "medium" | "high";
    evidence: string[];
    uncertainty: string[];
    must_preserve: string[];
  };
  coaching_guidance?: {
    scope: "action" | "level" | "whole_plan";
    observation: string;
    recommendation: string;
    warnings: string[];
    options_to_discuss: string[];
    questions_to_clarify: string[];
    preserve: string[];
    avoid: string[];
    guidelines: string[];
    confidence: "low" | "medium" | "high";
    change_family?: string | null;
    candidate_operation?: string | null;
    readiness?: string | null;
    must_not_execute_reason?: string | null;
    trajectory_hypothesis?: string | null;
    next_best_question?: string | null;
  } | null;
  materialization_candidates?: Array<{
    id: string;
    title: string;
    description?: string | null;
    status?: string | null;
    dimension?: string | null;
    kind?: string | null;
    item_type?: string | null;
    item_nature?: string | null;
    tracking_type?: string | null;
    cadence_label?: string | null;
    target_reps?: number | null;
    current_reps?: number | null;
    weekly_reps?: number | null;
    weekly_cadence_label?: string | null;
    availability_status?: string | null;
    available_this_week?: boolean | null;
    source_kind?: string | null;
    clarification_type?: string | null;
    clarification_section_labels?: string[];
  }>;
  allowed_patch_fields: string[];
  forbidden_patch_fields: string[];
  constraints: string[];
};

export type CoachPreferenceKey =
  | "coach.tone"
  | "coach.challenge_level"
  | "coach.question_tendency"
  | "coach.response_max_lines"
  | "coach.emoji_policy"
  | "coach.final_question_policy"
  | "coach.action_first_policy";

export type CoachPreferencesPatchBuilderInput = {
  operation_type: "update_coach_preferences";
  output_schema: "coach_preferences_patch_draft_v1";
  current_preferences: Partial<Record<CoachPreferenceKey, string>>;
  requested_patch: Partial<Record<CoachPreferenceKey, string>>;
  reason?: { evidence: string[] };
  constraints: string[];
  forbidden: string[];
};

export function buildOperationDraftRequest(input: {
  operation_id?: string;
  operation_type: OperationType;
  user_id: string;
  timezone: string;
  channel: ConversationChannel;
  trigger_message_id: string;
  current_user_message: string;
  operation_source?: OperationSourceKind;
  recommendation?: ProductRecommendation | null;
  previous_skill_id?: string | null;
  diagnosis?: OperationDraftRequest["diagnosis"];
  target?: OperationDraftRequest["target"];
  desired_attack_technique?: OperationDraftRequest["desired_attack_technique"];
  desired_attack_keyword?: string | null;
  evidence?: Partial<OperationDraftRequest["evidence"]>;
  allowed_operations?: string[];
  forbidden_operations?: string[];
  max_intrusiveness?: 1 | 2 | 3 | 4 | 5;
}): OperationDraftRequest {
  if (!input.user_id) throw new Error("operation_payload_user_id_missing");
  if (!input.timezone) throw new Error("operation_payload_timezone_missing");
  if (!input.trigger_message_id) {
    throw new Error("operation_payload_trigger_message_id_missing");
  }
  return {
    operation_id: input.operation_id ?? crypto.randomUUID(),
    operation_type: input.operation_type,
    source: {
      skill_id: input.previous_skill_id ?? "direct_request",
      recommendation_id: input.recommendation?.recommendation_id ?? "none",
      trigger_message_id: input.trigger_message_id,
      operation_source: input.operation_source ?? "direct_user_request",
    },
    user_context: {
      user_id: input.user_id,
      timezone: input.timezone,
      channel: input.channel,
      locale: "fr",
    },
    diagnosis: input.diagnosis ?? {
      confidence: 0.6,
      constraints: ["ask_confirmation_before_write"],
    },
    target: input.target ?? {},
    desired_attack_technique: input.desired_attack_technique,
    desired_attack_keyword: input.desired_attack_keyword ?? null,
    evidence: {
      current_user_message: input.current_user_message,
      recent_summary: input.evidence?.recent_summary ?? null,
      relevant_memory_items: input.evidence?.relevant_memory_items ?? [],
      action_observations: input.evidence?.action_observations ?? [],
    },
    product_constraints: {
      allowed_operations: input.allowed_operations ?? [input.operation_type],
      forbidden_operations: input.forbidden_operations ?? [],
      requires_confirmation: true,
      max_intrusiveness: input.max_intrusiveness ?? 3,
    },
  };
}

function ensure(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

export function buildAttackCardPayload(
  request: OperationDraftRequest,
): AttackCardGeneratorInput {
  if (request.operation_type !== "prepare_attack_card") {
    throw new Error("attack_card_operation_type_invalid");
  }
  ensure(request.target.plan_item_title, "attack_card_target_title_missing");
  const blockerType = request.diagnosis.blocker_type ?? "mixed";
  if (blockerType === "unknown") throw new Error("attack_card_blocker_missing");
  const targetKind = request.target.plan_item_id
    ? "plan_item"
    : "personal_action";
  return {
    operation_type: "prepare_attack_card",
    output_schema: "attack_card_draft_v1",
    target: {
      kind: targetKind,
      plan_item_id: request.target.plan_item_id ?? null,
      title: request.target.plan_item_title,
      current_instruction: request.target.plan_item_title,
    },
    blocker: {
      type: blockerType as AttackCardGeneratorInput["blocker"]["type"],
      evidence: [request.evidence.current_user_message].filter(Boolean),
      confidence: request.diagnosis.confidence,
    },
    desired_attack_angle: request.desired_attack_technique ?? "unknown",
    activation_keyword: request.desired_attack_keyword ?? null,
    constraints: [
      "short",
      "no_pressure",
      "must_be_doable_under_5_minutes",
      ...request.diagnosis.constraints,
    ],
    forbidden: [
      "do_not_moralize",
      "do_not_increase_difficulty",
      ...request.product_constraints.forbidden_operations,
    ],
  };
}

export function buildPotionSelectionPayload(
  request: OperationDraftRequest & {
    state_kind?: PotionSessionSelectorInput["state"]["kind"];
    state_intensity?: PotionSessionSelectorInput["state"]["intensity"];
    potion_type?: PotionSessionSelectorInput["potion_type"];
  },
): PotionSessionSelectorInput {
  if (request.operation_type !== "select_state_potion") {
    throw new Error("potion_operation_type_invalid");
  }
  ensure(request.state_kind, "potion_state_missing");
  ensure(request.potion_type, "potion_type_missing");
  return {
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: {
      kind: request.state_kind,
      intensity: request.state_intensity ?? "medium",
      evidence: [request.evidence.current_user_message].filter(Boolean),
    },
    potion_type: request.potion_type,
    context: {
      related_plan_item_id: request.target.plan_item_id ?? null,
      target_hint: request.target.plan_item_title ?? null,
      topic_hint: request.target.topic_id ?? null,
      timezone: request.user_context.timezone,
      current_local_date: currentLocalDateForTimezone(
        request.user_context.timezone,
      ),
    },
    constraints: [
      "short",
      "no_pressure",
      "no_safety_substitution",
      ...request.diagnosis.constraints,
    ],
    forbidden: ["do_not_moralize", "do_not_push_action_immediately"],
  };
}

export function buildRecurringReminderPayload(
  request: OperationDraftRequest & {
    recurrence?: RecurringReminderBuilderInput["recurrence"];
    reminder_content?: RecurringReminderBuilderInput["reminder_content"];
    destination?: RecurringReminderBuilderInput["destination"];
  },
): RecurringReminderBuilderInput {
  if (request.operation_type !== "create_recurring_reminder") {
    throw new Error("recurring_reminder_operation_type_invalid");
  }
  ensure(request.user_context.timezone, "recurring_reminder_timezone_missing");
  ensure(request.recurrence?.time, "recurring_reminder_time_missing");
  ensure(
    request.reminder_content?.message,
    "recurring_reminder_message_missing",
  );
  return {
    operation_type: "create_recurring_reminder",
    output_schema: "recurring_reminder_draft_v1",
    recurrence: {
      ...request.recurrence,
      timezone: request.recurrence.timezone || request.user_context.timezone,
    },
    reminder_content: request.reminder_content,
    destination: request.destination ?? { value: "base_de_vie" },
    constraints: [
      "no_spam",
      "clear_frequency",
      "clear_time",
      "requires_confirmation",
      ...request.diagnosis.constraints,
    ],
    forbidden: ["do_not_create_one_shot", "do_not_modify_plan_schedule"],
  };
}

export function buildDefenseCardPayload(
  request: OperationDraftRequest & {
    attachment?: DefenseCardGeneratorInput["attachment"];
    risk_situation?: DefenseCardGeneratorInput["risk_situation"];
    trigger?: DefenseCardGeneratorInput["trigger"];
    defense_goal?: DefenseCardGeneratorInput["defense_goal"];
    defense_response_hint?: DefenseCardGeneratorInput["defense_response_hint"];
  },
): DefenseCardGeneratorInput {
  if (request.operation_type !== "prepare_defense_card") {
    throw new Error("defense_card_operation_type_invalid");
  }
  ensure(request.attachment?.title, "defense_card_attachment_missing");
  ensure(request.risk_situation?.label, "defense_card_risk_situation_missing");
  return {
    operation_type: "prepare_defense_card",
    output_schema: "defense_card_draft_v1",
    attachment: request.attachment,
    risk_situation: request.risk_situation,
    trigger: request.trigger ?? {
      type: "habit_loop",
      evidence: [request.evidence.current_user_message],
      confidence: request.diagnosis.confidence,
    },
    defense_goal: request.defense_goal ?? "interrupt_impulse",
    defense_response_hint: request.defense_response_hint,
    constraints: [
      "short",
      "no_pressure",
      "no_safety_substitution",
      "must_be_actionable_in_the_moment",
      ...request.diagnosis.constraints,
    ],
    forbidden: ["do_not_moralize", "do_not_shame"],
  };
}

export function buildPlanAdjustmentPayload(
  request: OperationDraftRequest & {
    scope?: Omit<PlanAdjustmentGeneratorInput["scope"], "kind"> & {
      kind:
        | PlanAdjustmentGeneratorInput["scope"]["kind"]
        | "schedule_change"
        | "unknown";
    };
    adjustment_type?:
      | PlanAdjustmentGeneratorInput["adjustment_type"]
      | "unknown";
    reason?: PlanAdjustmentGeneratorInput["reason"];
    reason_change?: PlanAdjustmentGeneratorInput["reason_change"];
    change_target?: PlanAdjustmentGeneratorInput["change_target"];
    decision_basis?: PlanAdjustmentGeneratorInput["decision_basis"];
    coaching_guidance?: PlanAdjustmentGeneratorInput["coaching_guidance"];
    materialization_candidates?: PlanAdjustmentGeneratorInput[
      "materialization_candidates"
    ];
    allowed_patch_fields?: string[];
    forbidden_patch_fields?: string[];
  },
): PlanAdjustmentGeneratorInput {
  if (request.operation_type !== "adjust_plan_item") {
    throw new Error("plan_adjustment_operation_type_invalid");
  }
  ensure(request.scope, "plan_adjustment_scope_missing");
  if (request.scope.kind === "schedule_change") {
    throw new Error("plan_adjustment_schedule_change_fallback");
  }
  if (request.scope.kind === "unknown") {
    throw new Error("plan_adjustment_scope_missing");
  }
  ensure(request.adjustment_type, "plan_adjustment_type_missing");
  if (request.adjustment_type === "unknown") {
    throw new Error("plan_adjustment_type_missing");
  }
  ensure(
    request.allowed_patch_fields?.length,
    "plan_adjustment_allowed_patch_fields_missing",
  );
  return {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    scope: request.scope as PlanAdjustmentGeneratorInput["scope"],
    adjustment_type: request.adjustment_type,
    reason: request.reason ?? {
      type: "too_heavy",
      evidence: [request.evidence.current_user_message],
    },
    reason_change: request.reason_change,
    change_target: request.change_target,
    decision_basis: request.decision_basis,
    coaching_guidance: request.coaching_guidance ?? null,
    materialization_candidates: request.materialization_candidates ?? [],
    allowed_patch_fields: request.allowed_patch_fields,
    forbidden_patch_fields: request.forbidden_patch_fields ?? [
      "scheduled_day",
      "scheduled_date",
      "schedule",
    ],
    constraints: [
      "no_pressure",
      "minimal_patch",
      "preserve_plan_intent",
      "no_schedule_day_change",
      ...request.diagnosis.constraints,
    ],
  };
}

export function buildCoachPreferencesPayload(
  request: OperationDraftRequest & {
    current_preferences?: Partial<Record<CoachPreferenceKey, string>>;
    requested_patch?: Partial<Record<CoachPreferenceKey, string>>;
  },
): CoachPreferencesPatchBuilderInput {
  if (request.operation_type !== "update_coach_preferences") {
    throw new Error("coach_preferences_operation_type_invalid");
  }
  const patch = request.requested_patch ?? {};
  const allowed: CoachPreferenceKey[] = [
    "coach.tone",
    "coach.challenge_level",
    "coach.question_tendency",
    "coach.response_max_lines",
    "coach.emoji_policy",
    "coach.final_question_policy",
    "coach.action_first_policy",
  ];
  const keys = Object.keys(patch);
  ensure(keys.length, "coach_preferences_patch_missing");
  for (const key of keys) {
    if (!allowed.includes(key as CoachPreferenceKey)) {
      throw new Error("coach_preferences_unsupported_key");
    }
  }
  return {
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    current_preferences: request.current_preferences ?? {},
    requested_patch: patch,
    reason: { evidence: [request.evidence.current_user_message] },
    constraints: [
      "requires_confirmation",
      "explicit_user_preference_only",
      "do_not_infer_from_one_emotional_message",
    ],
    forbidden: ["unsupported_preference_key"],
  };
}

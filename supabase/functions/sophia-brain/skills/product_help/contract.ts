export type ProductHelpIntent =
  | "explain_feature"
  | "how_to"
  | "where_is_it"
  | "benefits"
  | "limits"
  | "can_i_do_x"
  | "modify_or_cancel_where"
  | "object_status_question"
  | "tool_action_request"
  | "compare_features"
  | "repeat"
  | "close"
  | "off_topic"
  | "safety"
  | "unclear";

export type ProductHelpTargetKind =
  | "feature_catalog"
  | "user_object"
  | "recent_effect"
  | "pending_draft"
  | "tool_flow"
  | "unknown";

export type ProductHelpObjectType =
  | "attack_card"
  | "defense_card"
  | "one_shot_reminder"
  | "recurring_reminder"
  | "potion"
  | "plan_item"
  | "preference"
  | "initiative"
  | "unknown";

export type ProductHelpConstraint =
  | "non_mutating"
  | "do_not_execute_tool"
  | "do_not_claim_object_exists_without_source"
  | "do_not_render_status_block"
  | "preserve_active_flow"
  | "short_reply"
  | "exact_location_requested";

export type ProductHelpBridgeOperationType =
  | "prepare_attack_card"
  | "prepare_defense_card"
  | "select_state_potion"
  | "create_recurring_reminder"
  | "one_shot_reminder"
  | "adjust_plan_item"
  | "update_coach_preferences";

export type ProductHelpLocalFlowAction =
  | "answer_product_question"
  | "clarify_product_question"
  | "answer_destination"
  | "compare_features"
  | "explain_limit"
  | "bridge_explanation_only"
  | "repeat_answer"
  | "apply_attempt"
  | "close_product_help"
  | "return_to_parent_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type ProductHelpVisibleTaskKind =
  | "answer_product_question"
  | "clarify_product_question"
  | "answer_destination"
  | "compare_features"
  | "explain_limit"
  | "bridge_explanation_only"
  | "repeat_answer"
  | "apply_attempt"
  | "close_product_help"
  | "safety";

export type ProductHelpLocalFlowState = {
  skill_id: "product_help";
  status: "open" | "answered" | "closing" | "exit_to_global" | "safety";
  mode: "standalone";
  product_help_state: {
    stage: "answering" | "clarifying" | "bridge_explained" | "closing";
    last_intent: string | null;
    last_target: Record<string, unknown>;
    last_answer_summary: string | null;
    last_catalog_feature_ids: string[];
    last_locations: string[];
    parent_flow_context: null;
    turn_count: number;
    max_turns: number;
    updated_at: string;
  };
};

export type ProductHelpLocalDispatcherOutput = {
  flow_action: ProductHelpLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  mode: "standalone" | "inline";
  product_help_intent: {
    kind: ProductHelpIntent;
    summary: string;
  };
  target: {
    kind: ProductHelpTargetKind;
    feature_id: string | null;
    object_type: ProductHelpObjectType | null;
    object_ref: string | null;
    confidence: "low" | "medium" | "high";
  };
  grounding: {
    catalog_feature_ids: string[];
    surface_ids: string[];
    db_sources_required: boolean;
    db_sources_used: string[];
    active_flow_used: boolean;
    missing_grounding_reason: string | null;
  };
  bridge: {
    needed: boolean;
    operation_type: ProductHelpBridgeOperationType | null;
    kind: "explain_only" | "offer_with_consent" | "handoff_needed" | null;
    executable: false;
    why: string | null;
  };
  state_updates: {
    status: ProductHelpLocalFlowState["status"];
    stage: ProductHelpLocalFlowState["product_help_state"]["stage"];
    turn_count_increment: number;
    close_after_visible: boolean;
    preserve_parent_flow: boolean;
  };
  visible_task: {
    kind: ProductHelpVisibleTaskKind;
    instruction: string;
  };
  return_to_parent: {
    needed: boolean;
    parent_skill_id: string | null;
    return_summary: string | null;
    preserve_parent_state: true;
  };
  exit_memo: {
    needed: boolean;
    reason:
      | "topic_change"
      | "explicit_tool_request"
      | "status_question"
      | "normal_coaching"
      | "safety"
      | "unknown"
      | "none";
    user_intent_summary: string | null;
    local_flow_context: {
      skill_id: "product_help";
      mode: "standalone" | "inline";
      stage: string | null;
      last_answer_summary: string | null;
      parent_skill_id: string | null;
      committed_effects: unknown[];
    };
    handoff_hint_for_global_dispatcher: {
      likely_intent:
        | "prepare_attack_card"
        | "prepare_defense_card"
        | "select_state_potion"
        | "update_coach_preferences"
        | "status_recap"
        | "adjust_plan_item"
        | "one_shot_reminder"
        | "create_recurring_reminder"
        | "normal_coaching"
        | "unknown";
      why: string | null;
      constraints: string[];
    };
  };
  evidence: string[];
};

export type ProductHelpDecision = {
  skill_id: "product_help";
  intent: ProductHelpIntent;
  target: {
    kind: ProductHelpTargetKind;
    feature_id?: string;
    object_type?: ProductHelpObjectType;
    object_ref?: string;
    confidence_band: "low" | "medium" | "high";
  };
  grounding: {
    catalog_feature_ids: string[];
    db_sources_required: boolean;
    db_sources_used: Array<{
      source_type:
        | "recent_effect"
        | "db_projection"
        | "active_flow"
        | "catalog";
      id?: string;
      label?: string;
    }>;
  };
  bridge?: {
    operation_type: ProductHelpBridgeOperationType;
    bridge_kind: "explain_only" | "offer_with_consent" | "handoff_needed";
    requires_confirmation: true;
  };
  constraints: ProductHelpConstraint[];
  response_contract: {
    max_questions: 0 | 1;
    allow_operation_suggestion: boolean;
    allow_status_projection: boolean;
    allow_generic_catalog_answer: boolean;
    must_include_location: boolean;
    must_include_limit: boolean;
  };
  operation_suggestions: [];
  reply: string;
  state_patch: Record<string, unknown>;
};

export function baseProductHelpDecision(
  patch: Omit<
    Partial<ProductHelpDecision>,
    "skill_id" | "operation_suggestions"
  >,
): ProductHelpDecision {
  const decision = {
    skill_id: "product_help",
    intent: "unclear",
    target: { kind: "unknown", confidence_band: "low" },
    grounding: {
      catalog_feature_ids: [],
      db_sources_required: false,
      db_sources_used: [],
    },
    constraints: [
      "non_mutating",
      "do_not_execute_tool",
      "do_not_claim_object_exists_without_source",
      "do_not_render_status_block",
    ],
    response_contract: {
      max_questions: 0,
      allow_operation_suggestion: false,
      allow_status_projection: false,
      allow_generic_catalog_answer: false,
      must_include_location: false,
      must_include_limit: false,
    },
    reply: "",
    state_patch: {},
    operation_suggestions: [],
  } satisfies ProductHelpDecision;
  return {
    ...decision,
    ...patch,
    skill_id: "product_help",
    intent: patch.intent ?? decision.intent,
    operation_suggestions: [],
  };
}

export function validateProductHelpDecision(
  decision: ProductHelpDecision,
): ProductHelpDecision {
  const constraints = new Set<ProductHelpConstraint>(decision.constraints);
  constraints.add("non_mutating");
  constraints.add("do_not_execute_tool");
  constraints.add("do_not_claim_object_exists_without_source");
  constraints.add("do_not_render_status_block");

  if (decision.bridge && decision.bridge.requires_confirmation !== true) {
    throw new Error("product_help_bridge_requires_confirmation");
  }

  const target = (decision.target.kind === "user_object" ||
      decision.target.kind === "recent_effect") &&
      !decision.target.object_type
    ? {
      ...decision.target,
      kind: "unknown" as const,
      confidence_band: "low" as const,
    }
    : decision.target;

  return {
    ...decision,
    target,
    constraints: [...constraints],
    response_contract: {
      ...decision.response_contract,
      allow_operation_suggestion: false,
      allow_status_projection: false,
    },
    operation_suggestions: [],
    state_patch: decision.state_patch ?? {},
  };
}

import type { NoteInformation } from "../../contracts/note_information.v1.ts";

export const DEMOTIVATION_REPAIR_SKILL_ID = "demotivation_repair" as const;

export type DemotivationRepairIntent =
  | "fatigue_drop"
  | "loss_of_meaning"
  | "failure_accumulation"
  | "avoidance_loop"
  | "overwhelm"
  | "concrete_action_emerged"
  | "asks_smaller_step"
  | "asks_no_tool_support"
  | "asks_recurring_support"
  | "status_or_meta_question"
  | "unclear";

export type DemotivationRepairConstraint =
  | "no_potion"
  | "no_tool"
  | "no_plan_edit"
  | "no_questions"
  | "one_question_max"
  | "concrete_before_question"
  | "short_reply"
  | "do_not_moralize"
  | "do_not_modify_plan_yet"
  | "prefer_smallest_action";

export type DemotivationRepairPhase =
  | "diagnose"
  | "reduce_friction"
  | "restore_meaning"
  | "stabilize_energy"
  | "action_card_ready"
  | "exit";

export type DemotivationRepairMotivationState =
  | "fatigue"
  | "loss_of_meaning"
  | "failure_accumulation"
  | "avoidance"
  | "overwhelm"
  | "unclear";

export type DemotivationRepairActionReadiness =
  | "none"
  | "hypothetical"
  | "ready"
  | "already_chosen";

export type DemotivationRepairConfidence = "low" | "medium" | "high";

export type DemotivationRepairBridgePotion = "clarte" | "courage" | "rappel";

export type DemotivationRepairVisiblePotionLabel =
  | "Potion de clarté"
  | "Potion de courage"
  | "Potion anti-décrochage";

export type DemotivationRepairLocalFlowAction =
  | "answer_repair"
  | "ask_gentle_clarification"
  | "reduce_friction"
  | "restore_meaning"
  | "stabilize_energy"
  | "smaller_step"
  | "action_card_candidate"
  | "potion_bridge_offer"
  | "confirm_potion_bridge"
  | "revise_repair_context"
  | "repeat_last_repair"
  | "get_info_product"
  | "get_info_db"
  | "apply_attempt"
  | "exit_to_global_dispatcher"
  | "cancel_flow"
  | "complete_flow"
  | "defer_flow"
  | "handoff_to_local_flow"
  | "safety_preempt";

export type DemotivationRepairVisibleTaskKind =
  | "diagnose"
  | "reduce_friction"
  | "restore_meaning"
  | "stabilize_energy"
  | "smaller_step"
  | "action_card_candidate"
  | "potion_bridge_offer"
  | "potion_bridge_choice"
  | "potion_bridge_handoff"
  | "ask_gentle_clarification"
  | "inline_tool_return"
  | "apply_attempt"
  | "repeat_repair"
  | "exit_or_cancel"
  | "safety";

export type DemotivationRepairDurableNeedKind =
  | "meaning_reconnection"
  | "courage_through_avoidance"
  | "anti_dropout_anchor";

export type DemotivationRepairPotionBridgeStatus =
  | "not_applicable"
  | "candidate"
  | "offered_waiting_consent"
  | "confirmed_handoff"
  | "blocked";

export type DemotivationRepairBridgePrefillCandidates = {
  plan_meaning_loss_reason?: string | null;
  avoidance_target?: string | null;
  blocker_kind?: "resultat" | "regard" | "inconfort" | "conflit" | null;
  drift_target?: string | null;
  drift_style?:
    | "oubli"
    | "repousse"
    | "laisse_filer"
    | "baisse_elan"
    | null;
};

export type DemotivationRepairBridgeCandidateValue = {
  candidate_value?: string | null;
  option_value?: string | null;
  option_label?: string | null;
  confidence: DemotivationRepairConfidence;
  source: "demotivation_repair";
};

export type DemotivationRepairNoteInformation = NoteInformation & {
  target_flow?:
    | "global"
    | "select_state_potion"
    | "safety"
    | "product_help"
    | "status_recap";
};

export type DemotivationRepairPotionBridgeContext = {
  origin_flow: "demotivation_repair";
  origin_flow_status: "diagnosed" | "bridge_consented";
  note_information: DemotivationRepairNoteInformation;
  origin_turn_summary: string;
  repair_intent: DemotivationRepairIntent;
  motivation_state: DemotivationRepairMotivationState;
  action_readiness: DemotivationRepairActionReadiness;
  demotivation_episode: {
    summary: string;
    user_words: string[];
    identity_freeze_risk: boolean;
    already_diagnosed: boolean;
  };
  durable_need: {
    kind: DemotivationRepairDurableNeedKind;
    summary: string;
  };
  selected_potion: DemotivationRepairBridgePotion;
  visible_potion_label: DemotivationRepairVisiblePotionLabel;
  selection_reason: string;
  prefill_candidates: Record<string, DemotivationRepairBridgeCandidateValue>;
  handoff_instruction_for_potion_subskill: string;
};

export type DemotivationRepairLocalState = {
  skill_id: "demotivation_repair";
  mode: "local_repair_flow";
  status: "active" | "closing" | "closed" | "handoff_to_potion" | "safety";
  repair_state: {
    intent: DemotivationRepairIntent;
    phase: DemotivationRepairPhase;
    motivation_state: DemotivationRepairMotivationState;
    action_readiness: DemotivationRepairActionReadiness;
    summary: string;
    user_words: string[];
    identity_freeze_risk: boolean;
    motivation_source_diagnosed: boolean;
  };
  last_visible_task: DemotivationRepairVisibleTaskKind | null;
  last_potion_bridge_offer: {
    selected_potion: DemotivationRepairBridgePotion;
    visible_potion_label: DemotivationRepairVisiblePotionLabel;
    durable_need: {
      kind: DemotivationRepairDurableNeedKind;
      summary: string;
    };
    prefill_candidates: DemotivationRepairBridgePrefillCandidates;
    selection_reason: string;
    offered_at_turn: number;
    note_information: DemotivationRepairNoteInformation;
  } | null;
  previous_repair_summary: string | null;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
};

export type DemotivationRepairConversationContext = {
  state_summary: string;
  user_words: string[];
  field_or_stage:
    | DemotivationRepairPhase
    | DemotivationRepairVisibleTaskKind
    | null;
  known_values: {
    intent: DemotivationRepairIntent;
    phase: DemotivationRepairPhase;
    motivation_state: DemotivationRepairMotivationState;
    action_readiness: DemotivationRepairActionReadiness;
    identity_freeze_risk: boolean;
    motivation_source_diagnosed: boolean;
  };
  missing_or_weak_values: string[];
  selected_candidate: {
    potion: DemotivationRepairBridgePotion | null;
    potion_label: DemotivationRepairVisiblePotionLabel | null;
    durable_need_kind: DemotivationRepairDurableNeedKind | null;
    durable_need_summary: string | null;
  };
  handoff_data: {
    bridge_context_summary: string | null;
    target_dispatcher:
      | "select_state_potion"
      | "safety_crisis"
      | "product_help"
      | "status_recap"
      | "global"
      | null;
  };
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
  db_context_summary: string | null;
  memory_context_summary: string | null;
  max_questions: 0 | 1;
};

export type DemotivationRepairVisibleTask = {
  kind: DemotivationRepairVisibleTaskKind;
  conversation_context: DemotivationRepairConversationContext;
};

export type DemotivationRepairLocalDispatcherOutput = {
  flow_action: DemotivationRepairLocalFlowAction;
  confidence: DemotivationRepairConfidence;
  risk_score: number;
  repair_state: DemotivationRepairLocalState["repair_state"];
  constraints: DemotivationRepairConstraint[];
  response_contract: DemotivationRepairResponseContract;
  potion_bridge: {
    status: DemotivationRepairPotionBridgeStatus;
    selected_potion: DemotivationRepairBridgePotion | null;
    visible_potion_label: DemotivationRepairVisiblePotionLabel | null;
    candidate_potions: Array<{
      potion_type: DemotivationRepairBridgePotion;
      visible_label: DemotivationRepairVisiblePotionLabel;
      confidence: DemotivationRepairConfidence;
      reason: string;
    }>;
    durable_need: {
      kind: DemotivationRepairDurableNeedKind | null;
      summary: string | null;
    };
    prefill_candidates: DemotivationRepairBridgePrefillCandidates;
    missing_before_handoff: string[];
    why_ready_or_blocked: string;
    note_information: DemotivationRepairNoteInformation | null;
  };
  visible_task: DemotivationRepairVisibleTask;
  exit_memo: {
    needed: boolean;
    reason:
      | "topic_change"
      | "explicit_tool_request"
      | "inline_product"
      | "inline_status"
      | "cancelled"
      | "safety"
      | "potion_handoff"
      | "none";
    flow_summary: string | null;
    handoff_hint_for_global_dispatcher: string | null;
    potion_bridge_context: Record<string, unknown> | null;
    note_information: DemotivationRepairNoteInformation | null;
  };
  evidence: string[];
};

export type DemotivationRepairResponseContract = {
  max_questions: 0 | 1;
  allow_plan_edit: boolean;
  allow_tool_suggestion: boolean;
  allow_potion_suggestion: boolean;
  allow_attack_card_suggestion: boolean;
  allow_concrete_action: boolean;
  tone: "grounded" | "soft_direct" | "energy_preserving";
};

const CONSTRAINTS: readonly DemotivationRepairConstraint[] = [
  "no_potion",
  "no_tool",
  "no_plan_edit",
  "no_questions",
  "one_question_max",
  "concrete_before_question",
  "short_reply",
  "do_not_moralize",
  "do_not_modify_plan_yet",
  "prefer_smallest_action",
];
const CONSTRAINT_SET = new Set<DemotivationRepairConstraint>(CONSTRAINTS);

function uniqConstraints(
  constraints: unknown,
): DemotivationRepairConstraint[] {
  if (!Array.isArray(constraints)) return ["do_not_moralize"];
  const next: DemotivationRepairConstraint[] = [];
  for (const value of constraints) {
    if (CONSTRAINT_SET.has(value as DemotivationRepairConstraint)) {
      const constraint = value as DemotivationRepairConstraint;
      if (!new Set(next).has(constraint)) next.push(constraint);
    }
  }
  if (!new Set(next).has("do_not_moralize")) next.push("do_not_moralize");
  return next;
}

export function normalizeDemotivationRepairConstraints(
  constraints: unknown,
): DemotivationRepairConstraint[] {
  return uniqConstraints(constraints);
}

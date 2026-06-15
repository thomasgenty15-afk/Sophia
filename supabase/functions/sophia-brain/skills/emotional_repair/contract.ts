import type { NoteInformation } from "../../contracts/note_information.v1.ts";

export type EmotionalRepairIntent =
  | "acute_self_attack"
  | "shame_or_guilt"
  | "anxiety_or_panic"
  | "relational_repair"
  | "emotion_lowered_action_blocked"
  | "asks_concrete_phrase"
  | "asks_regulation_without_potion"
  | "asks_recurring_support"
  | "status_or_meta_question"
  | "action_card_ready"
  | "unclear";

export type EmotionalRepairConstraint =
  | "no_potion"
  | "no_tool"
  | "no_plan"
  | "no_protocol"
  | "no_technique"
  | "no_questions"
  | "one_question_max"
  | "concrete_before_question"
  | "soft_support_only"
  | "short_reply"
  | "relationship_context"
  | "do_not_persist_identity_attack";

export type EmotionalRepairPhase =
  | "stabilize"
  | "de_shame"
  | "separate_fact_from_identity"
  | "repair_relationship"
  | "action_card_ready"
  | "exit";

export type EmotionalRepairDominance = "high" | "medium" | "low";

export type EmotionalRepairContextDomain =
  | "relationship"
  | "work"
  | "body"
  | "plan_execution"
  | "unknown";

export type EmotionalRepairResponseTone = "soft" | "grounded" | "direct_soft";

export type EmotionalRepairBridgePotion = "amour" | "guerison" | "apaisement";
export type EmotionalRepairPotionLabel =
  | "Potion d'amour"
  | "Potion de guerison"
  | "Potion d'apaisement";

export type EmotionalRepairLocalFlowAction =
  | "answer_repair"
  | "ask_gentle_clarification"
  | "repair_relationship"
  | "provide_concrete_phrase"
  | "soft_presence"
  | "regulation_without_potion"
  | "potion_bridge_offer"
  | "confirm_potion_bridge"
  | "revise_repair_context"
  | "repeat_last_repair"
  | "exit_to_global_dispatcher"
  | "cancel_flow"
  | "complete_flow"
  | "defer_flow"
  | "safety_preempt";

export type EmotionalRepairVisibleTaskKind =
  | "soft_presence"
  | "de_shame"
  | "separate_fact_from_identity"
  | "repair_relationship"
  | "concrete_phrase"
  | "stabilize_anxiety"
  | "potion_bridge_offer"
  | "potion_bridge_choice"
  | "potion_bridge_handoff"
  | "ask_gentle_clarification"
  | "repeat_repair"
  | "exit_or_cancel"
  | "safety";

export type EmotionalRepairConfidence = "low" | "medium" | "high";

export type EmotionalRepairDurableNeedKind =
  | "self_kindness"
  | "healing_after_hurt"
  | "pressure_relief";

export type EmotionalRepairPotionBridgeStatus =
  | "not_applicable"
  | "candidate"
  | "offered_waiting_consent"
  | "confirmed_handoff"
  | "blocked";

export type EmotionalRepairPotionCandidate = {
  potion_type: EmotionalRepairBridgePotion;
  confidence: EmotionalRepairConfidence;
  reason: string;
};

export type EmotionalRepairBridgePrefillCandidates = {
  love_lack_context?: string | null;
  love_state?: "dur" | "seul" | "vide" | null;
  recent_hurt?: string | null;
  dominant_feeling?:
    | "culpabilite"
    | "honte"
    | "decouragement"
    | "fatigue"
    | null;
  pressure_source?: string | null;
  pressure_state?: "stresse" | "a_cran" | "submerge" | null;
};

export type EmotionalRepairBridgeCandidateValue = {
  candidate_value?: string | null;
  option_value?: string | null;
  option_label?: string | null;
  confidence: EmotionalRepairConfidence;
  source: "emotional_repair";
};

export type EmotionalRepairPotionBridgeContext = {
  origin_flow: "emotional_repair";
  origin_flow_status: "stabilized" | "bridge_consented";
  note_information: NoteInformation;
  information_note: {
    departed_flow_summary: string;
    context_for_next_dispatcher: Record<string, unknown>;
  };
  origin_turn_summary: string;
  repair_intent: EmotionalRepairIntent;
  context_domain: EmotionalRepairContextDomain;
  emotional_episode: {
    summary: string;
    user_words: string[];
    identity_freeze_risk: boolean;
    already_stabilized: boolean;
  };
  durable_need: {
    kind: EmotionalRepairDurableNeedKind;
    summary: string;
  };
  selected_potion: EmotionalRepairBridgePotion;
  selection_reason: string;
  prefill_candidates: Record<string, EmotionalRepairBridgeCandidateValue>;
  handoff_instruction_for_potion_subskill: string;
};

export type EmotionalRepairLocalState = {
  skill_id: "emotional_repair";
  mode: "local_repair_flow";
  status: "active" | "closing" | "closed" | "handoff_to_potion" | "safety";
  repair_state: {
    intent: EmotionalRepairIntent;
    phase: EmotionalRepairPhase;
    emotional_dominance: EmotionalRepairDominance;
    context_domain: EmotionalRepairContextDomain;
    summary: string;
    user_words: string[];
    identity_freeze_risk: boolean;
    emotion_stabilized_enough_for_tool: boolean;
  };
  last_visible_task: EmotionalRepairVisibleTaskKind | null;
  last_potion_bridge_offer: {
    selected_potion: EmotionalRepairBridgePotion;
    durable_need: {
      kind: EmotionalRepairDurableNeedKind;
      summary: string;
    };
    prefill_candidates: EmotionalRepairBridgePrefillCandidates;
    selection_reason: string;
    offered_at_turn: number;
    information_note: EmotionalRepairPotionBridgeContext["information_note"];
  } | null;
  previous_repair_summary: string | null;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
};

export type EmotionalRepairConversationContext = {
  state_summary: string;
  user_words: string[];
  field_or_stage: EmotionalRepairPhase | EmotionalRepairVisibleTaskKind | null;
  known_values: {
    intent: EmotionalRepairIntent;
    phase: EmotionalRepairPhase;
    emotional_dominance: EmotionalRepairDominance;
    context_domain: EmotionalRepairContextDomain;
    identity_freeze_risk: boolean;
    emotion_stabilized_enough_for_tool: boolean;
  };
  missing_or_weak_values: string[];
  selected_candidate: {
    potion: EmotionalRepairBridgePotion | null;
    potion_label: EmotionalRepairPotionLabel | null;
    durable_need_kind: EmotionalRepairDurableNeedKind | null;
    durable_need_summary: string | null;
  };
  handoff_data: {
    bridge_context_summary: string | null;
    target_dispatcher:
      | "select_state_potion"
      | "safety_crisis"
      | "global"
      | null;
  };
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
  max_questions: 0 | 1;
};

export type EmotionalRepairVisibleTask = {
  kind: EmotionalRepairVisibleTaskKind;
  conversation_context: EmotionalRepairConversationContext;
};

export type EmotionalRepairLocalDispatcherOutput = {
  flow_action: EmotionalRepairLocalFlowAction;
  confidence: EmotionalRepairConfidence;
  risk_score: number;
  repair_state: EmotionalRepairLocalState["repair_state"];
  constraints: EmotionalRepairConstraint[];
  response_contract: {
    max_questions: 0 | 1;
    allow_plan: boolean;
    allow_tool_suggestion: boolean;
    allow_potion_suggestion: boolean;
    allow_concrete_action: boolean;
    tone: EmotionalRepairResponseTone;
  };
  potion_bridge: {
    status: EmotionalRepairPotionBridgeStatus;
    selected_potion: EmotionalRepairBridgePotion | null;
    candidate_potions: EmotionalRepairPotionCandidate[];
    durable_need: {
      kind: EmotionalRepairDurableNeedKind | null;
      summary: string | null;
    };
    prefill_candidates: EmotionalRepairBridgePrefillCandidates;
    missing_before_handoff: string[];
    why_ready_or_blocked: string;
  };
  visible_task: EmotionalRepairVisibleTask;
  exit_memo: {
    needed: boolean;
    reason:
      | "topic_change"
      | "explicit_tool_request"
      | "cancelled"
      | "safety"
      | "potion_handoff"
      | "none";
    flow_summary: string | null;
    handoff_hint_for_global_dispatcher: string | null;
    potion_bridge_context: Record<string, unknown> | null;
  };
  evidence: string[];
};

const CONSTRAINTS: readonly EmotionalRepairConstraint[] = [
  "no_potion",
  "no_tool",
  "no_plan",
  "no_protocol",
  "no_technique",
  "no_questions",
  "one_question_max",
  "concrete_before_question",
  "soft_support_only",
  "short_reply",
  "relationship_context",
  "do_not_persist_identity_attack",
];

export function normalizeEmotionalRepairConstraints(
  value: unknown,
): EmotionalRepairConstraint[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((item): item is EmotionalRepairConstraint =>
        typeof item === "string" &&
        (CONSTRAINTS as readonly string[]).includes(item)
      ),
    ),
  ];
}

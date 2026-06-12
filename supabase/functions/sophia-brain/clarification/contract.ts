import type { NoteInformation } from "../contracts/note_information.v1.ts";

export type ClarificationOwner =
  | "dispatcher"
  | "orientation_clarification"
  | "adjust_plan_handoff"
  | "attack_card_handoff"
  | "defense_card_handoff"
  | "state_potion_handoff"
  | "weekly_adaptive_review_v1"
  | string;

export type ClarificationAmbiguityKind =
  | "intent"
  | "target"
  | "scope"
  | "surface"
  | "timing"
  | "confirmation"
  | "handoff_readiness";

export type ClarificationAmbiguityAxis = ClarificationAmbiguityKind;

export type ClarificationCandidate = {
  id: string;
  label: string;
  description?: string | null;
  operation_type?: string | null;
  surface_id?: string | null;
  evidence?: string[];
};

export type ClarificationRequest = {
  clarification_id: string;
  owner: ClarificationOwner;
  ambiguity_kind: ClarificationAmbiguityKind;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_flow_state?: unknown;
  known_context?: Record<string, unknown>;
  candidates: ClarificationCandidate[];
  constraints: {
    no_chat_mutation: true;
    max_questions: 1;
    avoid_internal_terms: true;
  };
};

export type ClarificationCandidateSignal = {
  candidate_id: string;
  label: string;
  target_dispatcher: string;
  operation_type: string | null;
  surface_id: string | null;
  confidence: "medium" | "high";
  why_plausible: string;
  structured_payload_hint: Record<string, unknown>;
};

export type ClarificationLocalStatus =
  | "asking"
  | "still_ambiguous"
  | "resolved"
  | "cancelled"
  | "topic_change"
  | "safety";

export type ClarificationLocalFlowAction =
  | "ask_disambiguation"
  | "answer_clarification"
  | "still_ambiguous"
  | "resolved_to_candidate"
  | "revise_understanding"
  | "explain_candidate_options"
  | "get_info_product"
  | "get_info_db"
  | "exit_to_global_dispatcher"
  | "cancel_clarification"
  | "safety_preempt";

export type ClarificationVisibleTaskKind =
  | "ask_choice"
  | "ask_target_reference"
  | "confirm_candidate"
  | "inline_info_return"
  | "ask_disambiguation"
  | "ask_simpler_choice"
  | "still_ambiguous"
  | "resolved_transition"
  | "explain_options"
  | "repeat_question"
  | "stop_or_cancel"
  | "exit_ack"
  | "inline_tool_return"
  | "safety";

export type ClarificationKnownReferenceType =
  | "active_plan_item"
  | "attack_card"
  | "defense_card"
  | "recurring_reminder"
  | "product_concept"
  | "unknown";

export type ClarificationKnownReference = {
  type: ClarificationKnownReferenceType;
  id?: string;
  label: string;
  status?: string;
  why_relevant?: string;
};

export type ClarificationReferenceGuess = {
  type: ClarificationKnownReferenceType | string;
  id?: string;
  label: string;
  confidence: "low" | "medium" | "high";
  evidence: string[];
};

export type ClarificationMissingDecision = {
  kind:
    | "choose_direction"
    | "identify_target"
    | "confirm_target"
    | "understand_product_concept"
    | "answer_db_status"
    | "confirm_handoff";
  description: string;
};

export type ClarificationQuestionConstraints = {
  max_questions: 1;
  should_confirm_guess: boolean;
  should_offer_options: boolean;
  must_not_list_all_references: boolean;
  must_not_explain_internals: true;
};

export type ClarificationConversationContext = {
  question_goal: string;
  conflict_summary: string;
  candidate_labels: string[];
  selected_candidate_label: string | null;
  known_references: ClarificationKnownReference[];
  best_reference_guess: ClarificationReferenceGuess | null;
  missing_decision: ClarificationMissingDecision | null;
  question_constraints: ClarificationQuestionConstraints;
  question: string | null;
  user_words: string[];
  evidence_used: string[];
  do_not_say: string[];
  tone_constraints: string[];
};

export type ClarificationVisibleTask = {
  kind: ClarificationVisibleTaskKind;
  conversation_context: ClarificationConversationContext;
};

export type ClarificationLocalState = {
  skill_id: "clarification";
  mode: "local_flow";
  clarification_id: string;
  status: ClarificationLocalStatus;
  turn_count: number;
  max_turns: number;
  source_dispatcher: "global" | "local";
  source_flow_id: string | null;
  ambiguity_kind: ClarificationAmbiguityKind;
  ambiguity_axes: ClarificationAmbiguityAxis[];
  conflict_summary: string;
  candidate_signals: ClarificationCandidateSignal[];
  selected_candidate_id: string | null;
  user_words: string[];
  known_context: Record<string, unknown>;
  inbound_note_information: NoteInformation | Record<string, unknown> | null;
  outbound_note_information: NoteInformation | Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  no_chat_mutation: true;
};

export type ClarificationLocalDispatcherOutput = {
  flow_action: ClarificationLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  clarification_state: {
    clarification_id: string;
    status: ClarificationLocalStatus;
    source_dispatcher: "global" | "local";
    source_flow_id: string | null;
    ambiguity_kind: ClarificationAmbiguityKind;
    ambiguity_axes: ClarificationAmbiguityAxis[];
    conflict_summary: string;
    candidate_signals: ClarificationCandidateSignal[];
    selected_candidate_id: string | null;
    selected_candidate_label: string | null;
    why_selected_or_not: string;
    user_words: string[];
    turn_count: number;
  };
  inline_info: {
    requested: boolean;
    kind: "product" | "db" | null;
    question_to_answer: string | null;
    resume_clarification_goal: string | null;
    object_types?: Array<
      "attack_card" | "defense_card" | "recurring_reminder" | "plan_item"
    >;
  };
  visible_task: ClarificationVisibleTask;
  note_information: {
    needed: boolean;
    source_flow_id: "clarification";
    handoff_reason:
      | "clarification_resolved"
      | "topic_change"
      | "safety"
      | "inline_tool"
      | "none";
    target_dispatcher: string | null;
    handoff_context_for_next_dispatcher: string | null;
    user_words: string[];
    structured_context: Record<string, unknown>;
    confidence?: "low" | "medium" | "high";
  };
  evidence: string[];
};

export type BuildClarificationRequestInput =
  & Omit<
    Partial<ClarificationRequest>,
    "constraints" | "recent_messages" | "candidates"
  >
  & {
    owner: ClarificationOwner;
    ambiguity_kind: ClarificationAmbiguityKind;
    user_message: string;
    recent_messages?: ClarificationRequest["recent_messages"];
    candidates: ClarificationCandidate[];
  };

function compactText(value: unknown, maxChars: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxChars ? text.slice(0, maxChars).trimEnd() : text;
}

function normalizeCandidate(
  candidate: ClarificationCandidate,
): ClarificationCandidate {
  return {
    id: compactText(candidate.id, 120),
    label: compactText(candidate.label, 120),
    description: candidate.description == null
      ? null
      : compactText(candidate.description, 320),
    operation_type: candidate.operation_type == null
      ? null
      : compactText(candidate.operation_type, 120),
    surface_id: candidate.surface_id == null
      ? null
      : compactText(candidate.surface_id, 120),
    evidence: Array.isArray(candidate.evidence)
      ? candidate.evidence.map((item) => compactText(item, 240)).filter(Boolean)
        .slice(0, 6)
      : [],
  };
}

function confidenceFromCandidate(candidate: ClarificationCandidate) {
  const value = String(
    (candidate as unknown as { confidence_band?: unknown }).confidence_band ??
      "",
  );
  return value === "high" || value === "critical" ? "high" : "medium";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function candidateSignalFromCandidate(
  candidate: ClarificationCandidate,
): ClarificationCandidateSignal {
  const operationType = candidate.operation_type?.trim() || null;
  return {
    candidate_id: compactText(candidate.id, 120),
    label: compactText(candidate.label, 120),
    target_dispatcher: operationType ?? compactText(candidate.id, 120),
    operation_type: operationType,
    surface_id: candidate.surface_id?.trim() || null,
    confidence: confidenceFromCandidate(candidate),
    why_plausible: compactText(
      candidate.description ||
        (candidate.evidence ?? []).filter(Boolean).join("; ") ||
        "Signal candidat structure fourni par le dispatcher source.",
      320,
    ),
    structured_payload_hint: objectValue(
      (candidate as unknown as {
        payload_hint?: unknown;
        operation_input?: unknown;
      })
        .payload_hint ??
        (candidate as unknown as { operation_input?: unknown }).operation_input,
    ),
  };
}

export function candidatesFromSignals(
  signals: ClarificationCandidateSignal[],
): ClarificationCandidate[] {
  return signals.map((signal) => ({
    id: signal.candidate_id,
    label: signal.label,
    description: signal.why_plausible,
    operation_type: signal.operation_type,
    surface_id: signal.surface_id,
    evidence: ["clarification.candidate_signal"],
  }));
}

export function buildClarificationRequest(
  input: BuildClarificationRequestInput,
): ClarificationRequest {
  return {
    clarification_id: compactText(
      input.clarification_id ??
        `clarification_${crypto.randomUUID?.() ?? Date.now()}`,
      160,
    ),
    owner: input.owner,
    ambiguity_kind: input.ambiguity_kind,
    user_message: compactText(input.user_message, 4000),
    recent_messages: (input.recent_messages ?? []).slice(-8).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: compactText(message.content, 1200),
    })),
    active_flow_state: input.active_flow_state,
    known_context: input.known_context,
    candidates: input.candidates.map(normalizeCandidate).filter((candidate) =>
      candidate.id && candidate.label
    ),
    constraints: {
      no_chat_mutation: true,
      max_questions: 1,
      avoid_internal_terms: true,
    },
  };
}

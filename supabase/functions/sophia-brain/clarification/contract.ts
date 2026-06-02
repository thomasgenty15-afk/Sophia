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

export type ClarificationToolStatus =
  | "ask"
  | "resolved"
  | "still_ambiguous"
  | "cancelled"
  | "topic_change";

export type ClarificationToolOutput = {
  status: ClarificationToolStatus;
  selected_candidate_id?: string | null;
  confidence: "low" | "medium" | "high";
  question?: string | null;
  user_goal_summary?: string | null;
  reasoning_summary?: string | null;
  handoff_notes?: {
    known_slots?: Record<string, unknown>;
    missing_decision?: string | null;
    recommended_next_step?: string | null;
  };
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

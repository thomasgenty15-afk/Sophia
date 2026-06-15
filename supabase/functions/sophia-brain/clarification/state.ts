import type { ClarificationLocalState } from "./contract.ts";

export const CLARIFICATION_FLOW_STATE_KEY = "__clarification_flow_state";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isLocalCandidateSignal(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.candidate_id === "string" &&
    typeof value.label === "string" &&
    typeof value.target_dispatcher === "string" &&
    (value.confidence === "medium" || value.confidence === "high");
}

function stringValue(value: unknown, fallback = ""): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function normalizedCandidates(value: unknown): ClarificationLocalState[
  "candidate_signals"
] {
  return Array.isArray(value)
    ? value.filter(isLocalCandidateSignal) as ClarificationLocalState[
      "candidate_signals"
    ]
    : [];
}

export function isClarificationLocalState(
  value: unknown,
): value is ClarificationLocalState {
  return isRecord(value) &&
    value.skill_id === "clarification" &&
    value.mode === "local_flow" &&
    typeof value.clarification_id === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.candidate_signals) &&
    value.candidate_signals.every(isLocalCandidateSignal) &&
    Number.isFinite(Number(value.turn_count)) &&
    Number.isFinite(Number(value.max_turns));
}

export function normalizeClarificationLocalState(
  value: unknown,
): ClarificationLocalState | null {
  if (!isRecord(value)) return null;
  if (value.skill_id !== "clarification") return null;
  const candidateSignals = normalizedCandidates(value.candidate_signals);
  if (!candidateSignals.length) return null;
  const clarificationId = stringValue(value.clarification_id);
  if (!clarificationId) return null;
  const now = new Date().toISOString();
  const sourceDispatcher = stringValue(value.source_dispatcher, "global") ===
      "local"
    ? "local"
    : "global";
  return {
    skill_id: "clarification",
    mode: "local_flow",
    server_state_version: value.server_state_version ===
        "clarification_state_v2"
      ? "clarification_state_v2"
      : undefined,
    clarification_id: clarificationId,
    status: stringValue(value.status, "asking") as ClarificationLocalState[
      "status"
    ],
    turn_count: Math.max(0, Number(value.turn_count ?? 0) || 0),
    max_turns: Math.max(1, Number(value.max_turns ?? 4) || 4),
    source_dispatcher: sourceDispatcher,
    source_flow_id: stringValue(value.source_flow_id) || null,
    ambiguity_kind: stringValue(value.ambiguity_kind, "intent") as
      ClarificationLocalState["ambiguity_kind"],
    ambiguity_axes: Array.isArray(value.ambiguity_axes) &&
        value.ambiguity_axes.length
      ? value.ambiguity_axes as ClarificationLocalState["ambiguity_axes"]
      : [stringValue(value.ambiguity_kind, "intent") as
        ClarificationLocalState["ambiguity_kind"]],
    conflict_summary: stringValue(
      value.conflict_summary,
      "Clarification active.",
    ),
    candidate_signals: candidateSignals,
    selected_candidate_id: stringValue(value.selected_candidate_id) || null,
    user_words: Array.isArray(value.user_words)
      ? value.user_words.map((item) => stringValue(item)).filter(Boolean)
        .slice(-10)
      : [],
    known_context: recordValue(value.known_context) ?? {},
    inbound_note_information: recordValue(value.inbound_note_information),
    outbound_note_information: recordValue(value.outbound_note_information),
    current_question: stringValue(value.current_question) || null,
    current_ambiguity: recordValue(value.current_ambiguity),
    resolved_candidate: isLocalCandidateSignal(value.resolved_candidate)
      ? value.resolved_candidate as ClarificationLocalState[
        "resolved_candidate"
      ]
      : null,
    rejected_candidates: normalizedCandidates(value.rejected_candidates),
    pending_offer: recordValue(value.pending_offer),
    pending_confirmation: recordValue(value.pending_confirmation),
    last_selected_option: isLocalCandidateSignal(value.last_selected_option)
      ? value.last_selected_option as ClarificationLocalState[
        "last_selected_option"
      ]
      : null,
    active_subflow_context: recordValue(value.active_subflow_context),
    active_clarification_context: recordValue(
      value.active_clarification_context,
    ),
    exit_memo: recordValue(value.exit_memo),
    local_state_summary: stringValue(value.local_state_summary) || null,
    previous_flow_summary: stringValue(value.previous_flow_summary) || null,
    executable_from_chat: typeof value.executable_from_chat === "boolean"
      ? value.executable_from_chat
      : true,
    created_at: stringValue(value.created_at, now),
    updated_at: stringValue(value.updated_at, now),
  };
}

export function readClarificationLocalState(
  tempMemory: unknown,
): ClarificationLocalState | null {
  if (!isRecord(tempMemory)) return null;
  const state = tempMemory[CLARIFICATION_FLOW_STATE_KEY];
  return normalizeClarificationLocalState(state);
}

export function writeClarificationLocalState(
  tempMemory: unknown,
  state: ClarificationLocalState,
): Record<string, unknown> {
  const next = isRecord(tempMemory) ? { ...tempMemory } : {};
  next[CLARIFICATION_FLOW_STATE_KEY] = {
    ...state,
    skill_id: "clarification",
    mode: "local_flow",
    server_state_version: "clarification_state_v2",
    turn_count: Math.max(0, Number(state.turn_count ?? 0)),
    max_turns: Math.max(1, Number(state.max_turns ?? 4)),
  } satisfies ClarificationLocalState;
  return next;
}

export function clearClarificationState(
  tempMemory: unknown,
): Record<string, unknown> {
  const next = isRecord(tempMemory) ? { ...tempMemory } : {};
  delete next[CLARIFICATION_FLOW_STATE_KEY];
  return next;
}

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
    Number.isFinite(Number(value.max_turns)) &&
    value.no_chat_mutation === true;
}

export function readClarificationLocalState(
  tempMemory: unknown,
): ClarificationLocalState | null {
  if (!isRecord(tempMemory)) return null;
  const state = tempMemory[CLARIFICATION_FLOW_STATE_KEY];
  return isClarificationLocalState(state) ? state : null;
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
    turn_count: Math.max(0, Number(state.turn_count ?? 0)),
    max_turns: Math.max(1, Number(state.max_turns ?? 4)),
    no_chat_mutation: true,
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

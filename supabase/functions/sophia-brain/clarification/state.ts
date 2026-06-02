import type {
  ClarificationAmbiguityKind,
  ClarificationCandidate,
  ClarificationOwner,
} from "./contract.ts";

export const CLARIFICATION_STATE_KEY = "__clarification_state_v1";

export type ClarificationState = {
  skill_id: "orientation_clarification";
  clarification_id: string;
  owner: ClarificationOwner;
  ambiguity_kind: ClarificationAmbiguityKind;
  candidates: ClarificationCandidate[];
  known_context?: Record<string, unknown>;
  turn_count: number;
  max_turns: number;
  created_at: string;
  no_chat_mutation: true;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCandidate(value: unknown): value is ClarificationCandidate {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string";
}

export function isClarificationState(
  value: unknown,
): value is ClarificationState {
  return isRecord(value) &&
    value.skill_id === "orientation_clarification" &&
    typeof value.clarification_id === "string" &&
    typeof value.owner === "string" &&
    typeof value.ambiguity_kind === "string" &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isCandidate) &&
    Number.isFinite(Number(value.turn_count)) &&
    Number.isFinite(Number(value.max_turns)) &&
    typeof value.created_at === "string" &&
    value.no_chat_mutation === true &&
    (value.known_context === undefined || isRecord(value.known_context));
}

export function readClarificationState(
  tempMemory: unknown,
): ClarificationState | null {
  if (!isRecord(tempMemory)) return null;
  const state = tempMemory[CLARIFICATION_STATE_KEY];
  return isClarificationState(state) ? state : null;
}

export function writeClarificationState(
  tempMemory: unknown,
  state: ClarificationState,
): Record<string, unknown> {
  const next = isRecord(tempMemory) ? { ...tempMemory } : {};
  next[CLARIFICATION_STATE_KEY] = {
    ...state,
    skill_id: "orientation_clarification",
    turn_count: Math.max(0, Number(state.turn_count ?? 0)),
    max_turns: Math.max(1, Number(state.max_turns ?? 2)),
    no_chat_mutation: true,
  } satisfies ClarificationState;
  return next;
}

export function clearClarificationState(
  tempMemory: unknown,
): Record<string, unknown> {
  const next = isRecord(tempMemory) ? { ...tempMemory } : {};
  delete next[CLARIFICATION_STATE_KEY];
  return next;
}

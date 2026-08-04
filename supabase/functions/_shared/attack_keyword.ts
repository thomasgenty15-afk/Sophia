export function normalizeAttackKeyword(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type AttackKeywordTriggerPayload = {
  activation_keyword: string;
  activation_keyword_normalized: string;
  risk_situation: string;
  strength_anchor: string;
  first_response_intent: string;
  assistant_prompt: string;
};

export type AttackKeywordTriggerCandidate<T = unknown> = {
  payload: AttackKeywordTriggerPayload;
  data: T;
};

export function detectAttackKeywordTrigger<T>(
  userMessage: string,
  candidates: AttackKeywordTriggerCandidate<T>[],
): AttackKeywordTriggerCandidate<T> | null {
  const normalized = normalizeAttackKeyword(userMessage);
  if (!normalized) return null;

  return candidates.find((candidate) =>
    candidate.payload.activation_keyword_normalized === normalized
  ) ?? null;
}

export interface CandidatePromotionInput {
  id: string;
  user_id: string;
  confidence: number;
  sensitivity_level?: string | null;
  created_at: string;
  source_count: number;
  link_count: number;
  topic_is_durable?: boolean;
  explicit_confirmation?: boolean;
  action_confirmed?: boolean;
}

export type CandidatePromotionDecision =
  | { action: "promote"; reason: string }
  | { action: "archive"; reason: string }
  | { action: "keep_candidate"; reason: string };

function ageDays(createdAt: string, now: Date): number {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, (now.getTime() - created) / 86_400_000);
}

export function decideCandidatePromotion(
  candidate: CandidatePromotionInput,
  now = new Date(),
): CandidatePromotionDecision {
  const age = ageDays(candidate.created_at, now);
  if (candidate.explicit_confirmation) {
    return { action: "promote", reason: "explicit_confirmation" };
  }
  if (candidate.action_confirmed) {
    return { action: "promote", reason: "action_signal_confirmed" };
  }
  if (candidate.source_count >= 2 && candidate.confidence >= 0.65) {
    return { action: "promote", reason: "reaffirmed_by_multiple_sources" };
  }
  if (candidate.topic_is_durable && candidate.confidence >= 0.70) {
    return { action: "promote", reason: "linked_topic_became_durable" };
  }
  if (age >= 14 && candidate.source_count < 2) {
    return { action: "archive", reason: "candidate_expired_no_reaffirmation" };
  }
  if (age >= 7 && candidate.link_count === 0) {
    return { action: "archive", reason: "candidate_unlinked_after_7d" };
  }
  if (
    age >= 7 && candidate.sensitivity_level === "sensitive" &&
    candidate.confidence < 0.65
  ) {
    return { action: "archive", reason: "sensitive_low_confidence_after_7d" };
  }
  return { action: "keep_candidate", reason: "insufficient_promotion_signal" };
}

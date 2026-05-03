import type {
  DryRunCandidate,
  MemorizerWriteStatus,
  WriteDecision,
} from "./types.ts";

function hasSource(candidate: DryRunCandidate): boolean {
  return Array.isArray(candidate.item.source_message_ids) &&
    candidate.item.source_message_ids.some((id) => String(id ?? "").trim());
}

function bestLinkConfidence(candidate: DryRunCandidate): number {
  return Math.max(
    candidate.topic_link?.confidence ?? 0,
    ...(candidate.entity_links ?? []).map((link) => link.confidence),
    candidate.action_link?.confidence ?? 0,
  );
}

export function decideInitialWriteStatus(
  candidate: DryRunCandidate,
): WriteDecision {
  if (candidate.dedupe.decision === "reject_duplicate") {
    return { candidate, status: "reject", reason: "duplicate" };
  }
  if (!hasSource(candidate)) {
    return { candidate, status: "reject", reason: "missing_source" };
  }
  if (candidate.item.confidence < 0.55) {
    return { candidate, status: "reject", reason: "low_confidence" };
  }
  const linkConfidence = bestLinkConfidence(candidate);
  if (candidate.item.requires_user_initiated) {
    return {
      candidate,
      status: "candidate",
      reason: "requires_user_initiated",
    };
  }
  if (candidate.item.kind === "action_observation" && !candidate.action_link) {
    return {
      candidate,
      status: "candidate",
      reason: "action_without_confirmed_plan_item",
    };
  }
  if (candidate.item.confidence >= 0.75 && linkConfidence >= 0.70) {
    return { candidate, status: "active", reason: "high_confidence_linked" };
  }
  return {
    candidate,
    status: "candidate",
    reason: linkConfidence < 0.70 ? "ambiguous_link" : "grey_confidence",
  };
}

export function decideInitialWriteStatuses(
  candidates: DryRunCandidate[],
): WriteDecision[] {
  return candidates.map(decideInitialWriteStatus);
}

export function countWriteStatuses(
  decisions: WriteDecision[],
): Record<MemorizerWriteStatus, number> {
  return decisions.reduce((acc, decision) => {
    acc[decision.status]++;
    return acc;
  }, { active: 0, candidate: 0, reject: 0 });
}

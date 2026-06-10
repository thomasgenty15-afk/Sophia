import type { MemoryWriteCandidate } from "../contracts/memory_write_candidate.v1.ts";
import type { RiskBand } from "../contracts/turn_frame.v1.ts";

// Memory runtime boundary: skills provide MemoryWriteCandidate values; this
// module validates, rejects, invalidates or queues them for the memorizer.
// Current operation EffectLedger entries do not yet prove queued memory writes.
export type MemoryCandidateRejectReason =
  | "invalid_schema"
  | "missing_evidence"
  | "empty_content"
  | "anti_identity_freeze_not_checked"
  | "identity_freeze_fact_rejected"
  | "safety_risk_requires_risk_signal"
  | "duplicate_skipped";

export type MemoryCandidateAcceptReason =
  | "queued_for_memorizer"
  | "correction_note_queued";

export type MemoryCandidateImmediatePayloadItem = {
  id: string;
  content_text: string;
  status?: string;
  sensitivity_level?: 0 | 1 | 2 | 3 | 4 | "normal" | "sensitive" | "safety";
};

export type MemoryCandidateQueuedJob = {
  user_id: string;
  source_message_id: string;
  skill_run_id?: string;
  operation_id?: string;
  idempotency_key: string;
  candidate: MemoryWriteCandidate;
  created_by: "conversation_runtime_s7";
};

export type MemoryCandidateInvalidation = {
  item_id: string;
  reason: "correction_immediate_payload_invalidation";
};

export type MemoryCandidateSink = {
  enqueue: (job: MemoryCandidateQueuedJob) => Promise<void> | void;
  hasIdempotencyKey?: (key: string) => Promise<boolean> | boolean;
  rememberIdempotencyKey?: (key: string) => Promise<void> | void;
  invalidatePayloadItems?: (
    invalidations: MemoryCandidateInvalidation[],
  ) => Promise<void> | void;
};

export type MemoryCandidateAccepted = {
  candidate: MemoryWriteCandidate;
  reason: MemoryCandidateAcceptReason;
  idempotency_key: string;
};

export type MemoryCandidateRejected = {
  candidate: unknown;
  reason: MemoryCandidateRejectReason;
  detail?: string;
};

export type MemoryCandidateDispatchInput = {
  user_id: string;
  source_message_id: string;
  candidates: unknown[];
  skill_run_id?: string;
  operation_id?: string;
  safety_pregate_risk_band?: RiskBand;
  immediate_payload?: {
    items: MemoryCandidateImmediatePayloadItem[];
  };
  sink?: MemoryCandidateSink;
};

export type MemoryCandidateDispatchResult = {
  accepted: MemoryCandidateAccepted[];
  rejected: MemoryCandidateRejected[];
  invalidated: MemoryCandidateInvalidation[];
  queued_jobs: MemoryCandidateQueuedJob[];
  counts: {
    accepted: number;
    rejected: number;
    invalidated: number;
    duplicate_skipped: number;
  };
};

const VALID_KINDS = new Set([
  "statement",
  "event",
  "preference",
  "fact",
  "action_observation",
  "correction_note",
  "risk_signal",
]);
const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);
const VALID_SENSITIVITY = new Set([0, 1, 2, 3, 4]);
const VALID_SCOPE = new Set(["moment", "session", "topic", "global"]);
const MEDIUM_OR_HIGHER_RISK = new Set(["medium", "high", "critical"]);

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stableText(value: string): string {
  return normalize(value).replace(/\s+/g, " ").trim();
}

function idempotencyKey(input: {
  user_id: string;
  source_message_id: string;
  candidate: MemoryWriteCandidate;
}): string {
  return [
    input.user_id,
    input.source_message_id,
    input.candidate.kind,
    stableText(input.candidate.content_text),
  ].join(":");
}

function identityFreezePattern(text: string): boolean {
  void text;
  return false;
}

function parseTargetIds(candidate: MemoryWriteCandidate): string[] {
  const hints = candidate.entity_hints ?? [];
  const ids: string[] = [];
  for (const hint of hints) {
    const trimmed = hint.trim();
    const separator = trimmed.indexOf(":");
    if (separator <= 0) continue;
    const prefix = trimmed.slice(0, separator).toLowerCase();
    if (prefix !== "target" && prefix !== "memory" && prefix !== "item") {
      continue;
    }
    const id = trimmed.slice(separator + 1).trim();
    if (id) ids.push(id);
  }
  return ids;
}

function relationCorrectionTerms(content: string): {
  invalid: string[];
  replacement: string[];
} {
  const normalized = normalize(content);
  const pairs: Array<[string, string]> = [
    ["pere", "frere"],
    ["papa", "frere"],
    ["mere", "soeur"],
    ["maman", "soeur"],
    ["soeur", "amie"],
    ["frere", "ami"],
    ["ex", "collegue"],
  ];
  const invalid: string[] = [];
  const replacement: string[] = [];
  for (const [from, to] of pairs) {
    if (normalized.includes(from) && normalized.includes(to)) {
      invalid.push(from);
      replacement.push(to);
    }
  }
  return { invalid, replacement };
}

export function validateMemoryWriteCandidate(
  value: unknown,
  options: { safety_pregate_risk_band?: RiskBand } = {},
): { ok: true; candidate: MemoryWriteCandidate } | {
  ok: false;
  reason: MemoryCandidateRejectReason;
  detail?: string;
} {
  if (!isRecord(value)) {
    return { ok: false, reason: "invalid_schema", detail: "not an object" };
  }
  const candidate = value as Partial<MemoryWriteCandidate>;
  if (
    typeof candidate.kind !== "string" || !VALID_KINDS.has(candidate.kind) ||
    typeof candidate.content_text !== "string" ||
    !Array.isArray(candidate.evidence_source_ids) ||
    typeof candidate.confidence_band !== "string" ||
    !VALID_CONFIDENCE.has(candidate.confidence_band) ||
    !VALID_SENSITIVITY.has(candidate.sensitivity_level as number) ||
    typeof candidate.persistence_rationale !== "string" ||
    typeof candidate.should_persist_default !== "boolean" ||
    typeof candidate.anti_identity_freeze_checked !== "boolean"
  ) {
    return { ok: false, reason: "invalid_schema" };
  }
  if (candidate.content_text.trim().length === 0) {
    return { ok: false, reason: "empty_content" };
  }
  if (
    candidate.evidence_source_ids.length === 0 ||
    candidate.evidence_source_ids.some((id) =>
      typeof id !== "string" || id.trim().length === 0
    )
  ) {
    return { ok: false, reason: "missing_evidence" };
  }
  if (!candidate.anti_identity_freeze_checked) {
    return { ok: false, reason: "anti_identity_freeze_not_checked" };
  }
  if (
    candidate.kind === "fact" && identityFreezePattern(candidate.content_text)
  ) {
    return { ok: false, reason: "identity_freeze_fact_rejected" };
  }
  if (
    options.safety_pregate_risk_band &&
    MEDIUM_OR_HIGHER_RISK.has(options.safety_pregate_risk_band) &&
    candidate.kind !== "risk_signal"
  ) {
    return { ok: false, reason: "safety_risk_requires_risk_signal" };
  }
  if (
    candidate.topic_hint !== undefined &&
    candidate.topic_hint !== null &&
    typeof candidate.topic_hint !== "string"
  ) {
    return { ok: false, reason: "invalid_schema", detail: "topic_hint" };
  }
  if (
    candidate.entity_hints !== undefined &&
    !(
      Array.isArray(candidate.entity_hints) &&
      candidate.entity_hints.every((hint) => typeof hint === "string")
    )
  ) {
    return { ok: false, reason: "invalid_schema", detail: "entity_hints" };
  }
  if (
    candidate.scope_hint !== undefined &&
    !VALID_SCOPE.has(candidate.scope_hint)
  ) {
    return { ok: false, reason: "invalid_schema", detail: "scope_hint" };
  }
  return { ok: true, candidate: candidate as MemoryWriteCandidate };
}

export function findCorrectionInvalidations(input: {
  candidate: MemoryWriteCandidate;
  immediate_payload?: { items: MemoryCandidateImmediatePayloadItem[] };
}): MemoryCandidateInvalidation[] {
  if (input.candidate.kind !== "correction_note" || !input.immediate_payload) {
    return [];
  }
  const targetIds = new Set(parseTargetIds(input.candidate));
  const terms = relationCorrectionTerms(input.candidate.content_text);
  const invalidations: MemoryCandidateInvalidation[] = [];
  for (const item of input.immediate_payload.items) {
    const itemText = normalize(item.content_text);
    const explicitTarget = targetIds.has(item.id);
    const relationTarget = terms.invalid.some((term) =>
      itemText.includes(term)
    ) &&
      !terms.replacement.some((term) => itemText.includes(term));
    if (explicitTarget || relationTarget) {
      invalidations.push({
        item_id: item.id,
        reason: "correction_immediate_payload_invalidation",
      });
    }
  }
  return invalidations;
}

export class InMemoryMemoryCandidateSink implements MemoryCandidateSink {
  queued_jobs: MemoryCandidateQueuedJob[] = [];
  invalidations: MemoryCandidateInvalidation[] = [];
  private keys = new Set<string>();

  hasIdempotencyKey(key: string): boolean {
    return this.keys.has(key);
  }

  rememberIdempotencyKey(key: string): void {
    this.keys.add(key);
  }

  enqueue(job: MemoryCandidateQueuedJob): void {
    this.queued_jobs.push(job);
  }

  invalidatePayloadItems(invalidations: MemoryCandidateInvalidation[]): void {
    this.invalidations.push(...invalidations);
  }
}

export async function dispatchMemoryCandidates(
  input: MemoryCandidateDispatchInput,
): Promise<MemoryCandidateDispatchResult> {
  const sink = input.sink ?? new InMemoryMemoryCandidateSink();
  const accepted: MemoryCandidateAccepted[] = [];
  const rejected: MemoryCandidateRejected[] = [];
  const invalidated: MemoryCandidateInvalidation[] = [];
  const queuedJobs: MemoryCandidateQueuedJob[] = [];
  let duplicateSkipped = 0;

  for (const value of input.candidates) {
    const validation = validateMemoryWriteCandidate(value, {
      safety_pregate_risk_band: input.safety_pregate_risk_band,
    });
    if (!validation.ok) {
      rejected.push({
        candidate: value,
        reason: validation.reason,
        detail: validation.detail,
      });
      continue;
    }

    const candidate = validation.candidate;
    const key = idempotencyKey({
      user_id: input.user_id,
      source_message_id: input.source_message_id,
      candidate,
    });
    if (await sink.hasIdempotencyKey?.(key)) {
      duplicateSkipped += 1;
      rejected.push({ candidate, reason: "duplicate_skipped" });
      continue;
    }

    await sink.rememberIdempotencyKey?.(key);
    const job: MemoryCandidateQueuedJob = {
      user_id: input.user_id,
      source_message_id: input.source_message_id,
      skill_run_id: input.skill_run_id,
      operation_id: input.operation_id,
      idempotency_key: key,
      candidate,
      created_by: "conversation_runtime_s7",
    };
    await sink.enqueue(job);
    queuedJobs.push(job);

    const correctionInvalidations = findCorrectionInvalidations({
      candidate,
      immediate_payload: input.immediate_payload,
    });
    if (correctionInvalidations.length > 0) {
      await sink.invalidatePayloadItems?.(correctionInvalidations);
      invalidated.push(...correctionInvalidations);
    }
    accepted.push({
      candidate,
      idempotency_key: key,
      reason: candidate.kind === "correction_note"
        ? "correction_note_queued"
        : "queued_for_memorizer",
    });
  }

  return {
    accepted,
    rejected,
    invalidated,
    queued_jobs: queuedJobs,
    counts: {
      accepted: accepted.length,
      rejected: rejected.length,
      invalidated: invalidated.length,
      duplicate_skipped: duplicateSkipped,
    },
  };
}

export function buildOperationActionObservationCandidate(input: {
  operation_type: string;
  source_message_id: string;
  summary: string;
  sensitivity_level?: 0 | 1 | 2 | 3 | 4;
  topic_hint?: string;
  entity_hints?: string[];
}): MemoryWriteCandidate {
  return {
    kind: "action_observation",
    content_text: `${input.operation_type}: ${input.summary}`,
    evidence_source_ids: [input.source_message_id],
    confidence_band: "medium",
    sensitivity_level: input.sensitivity_level ?? 1,
    persistence_rationale:
      "Structured operation outcome; memorizer decides whether it indicates a durable pattern.",
    should_persist_default: false,
    anti_identity_freeze_checked: true,
    topic_hint: input.topic_hint,
    entity_hints: input.entity_hints,
    scope_hint: "session",
  };
}

export function evaluateMemoryRetention(input: {
  record_kind: "memory_item" | "change_log";
  deleted_at: string;
  now_iso: string;
}): "retain" | "hard_delete" {
  const deletedAt = new Date(input.deleted_at).getTime();
  const now = new Date(input.now_iso).getTime();
  const ageDays = (now - deletedAt) / (24 * 60 * 60 * 1000);
  const limit = input.record_kind === "memory_item" ? 90 : 365;
  return ageDays >= limit ? "hard_delete" : "retain";
}

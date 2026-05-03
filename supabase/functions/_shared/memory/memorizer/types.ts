import type {
  AggregationKind,
  EntityType,
  MemoryItemKind,
  MemoryItemStatus,
  ProcessingRole,
  SensitivityCategory,
  SensitivityLevel,
} from "../types.v1.ts";

export const MEMORY_EXTRACTION_PROMPT_VERSION =
  "memory.memorizer.extraction.v1";
export const MEMORY_EXTRACTION_MODEL_DEFAULT = "gemini-3-flash-preview";

export interface MemorizerMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface KnownTopic {
  id: string;
  slug?: string | null;
  title: string;
  lifecycle_stage?: "candidate" | "durable" | "dormant" | "archived" | null;
  search_doc?: string | null;
  domain_keys?: string[] | null;
}

export interface KnownEntity {
  id: string;
  entity_type: EntityType;
  display_name: string;
  aliases?: string[] | null;
  relation_to_user?: string | null;
  status?: string | null;
  embedding?: number[] | null;
  metadata?: Record<string, unknown> | null;
}

export interface KnownMemoryItem {
  id: string;
  kind: MemoryItemKind;
  content_text: string;
  normalized_summary?: string | null;
  canonical_key?: string | null;
  domain_keys?: string[] | null;
  topic_ids?: string[] | null;
  entity_ids?: string[] | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  source_message_id?: string | null;
  embedding?: number[] | null;
  status?: MemoryItemStatus | string | null;
}

export interface TemporalHint {
  raw: string;
  resolved_start_at: string;
  resolved_end_at: string;
  precision: string;
  confidence: number;
  timezone: string;
}

export interface PlanSignal {
  plan_item_id: string;
  title?: string;
  occurrence_ids?: string[];
  observation_window_start?: string | null;
  observation_window_end?: string | null;
}

export interface ExtractedMemoryItem {
  kind: MemoryItemKind;
  content_text: string;
  normalized_summary?: string | null;
  domain_keys: string[];
  confidence: number;
  importance_score?: number;
  sensitivity_level: SensitivityLevel;
  sensitivity_categories?: SensitivityCategory[];
  requires_user_initiated?: boolean;
  source_message_ids: string[];
  evidence_quote?: string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  time_precision?: string | null;
  entity_mentions?: string[];
  topic_hint?: string | null;
  canonical_key_hint?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ExtractedEntity {
  entity_type: EntityType;
  display_name: string;
  aliases?: string[];
  relation_to_user?: string | null;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface ExtractedCorrection {
  operation_type: "invalidate" | "supersede" | "hide" | "delete";
  target_hint: string;
  reason?: string | null;
  source_message_ids: string[];
}

export interface RejectedObservation {
  reason:
    | "small_talk"
    | "low_confidence"
    | "no_source"
    | "diagnostic_attempt"
    | "already_known"
    | "duplicate"
    | "invalid_domain_key"
    | "invalid_kind"
    | "event_missing_date"
    | "statement_as_fact"
    | "source_not_found"
    | "other";
  text: string;
  existing_memory_item_id?: string | null;
  source_message_ids?: string[];
  metadata?: Record<string, unknown>;
}

export interface ExtractionPayload {
  memory_items: ExtractedMemoryItem[];
  entities: ExtractedEntity[];
  corrections: ExtractedCorrection[];
  rejected_observations: RejectedObservation[];
}

export interface ValidationIssue {
  code:
    | RejectedObservation["reason"]
    | "empty_content"
    | "missing_sensitive_tag";
  message: string;
  item_index?: number;
  entity_index?: number;
}

export interface ValidatedMemoryItem extends ExtractedMemoryItem {
  canonical_key: string;
}

export interface ValidationResult {
  accepted_items: ValidatedMemoryItem[];
  rejected_items: Array<{
    item: ExtractedMemoryItem;
    issues: ValidationIssue[];
  }>;
  accepted_entities: ExtractedEntity[];
  rejected_entities: Array<{
    entity: ExtractedEntity;
    issues: ValidationIssue[];
  }>;
  rejected_observations: RejectedObservation[];
  statement_as_fact_violation_count: number;
}

export type DedupeDecisionType =
  | "create_new"
  | "add_source_to_existing"
  | "merge_into_existing"
  | "supersede_existing"
  | "reject_duplicate";

export interface DedupeDecision {
  decision: DedupeDecisionType;
  item: ValidatedMemoryItem;
  existing_item_id?: string | null;
  similarity?: number | null;
  reason: string;
}

export interface EntityResolutionDecision {
  extracted: ExtractedEntity;
  decision: "reuse" | "create_candidate" | "reject_noise" | "llm_judge_needed";
  entity_id?: string | null;
  normalized_key: string;
  aliases: string[];
  reason: string;
}

export interface TopicLinkDecision {
  item: ValidatedMemoryItem;
  topic_id: string | null;
  topic_slug: string | null;
  relation_type: "about" | "supports" | "mentioned_with" | "blocks" | "helps";
  confidence: number;
  reason: string;
}

export interface EntityLinkDecision {
  item: ValidatedMemoryItem;
  entity_id: string;
  relation_type: "mentions" | "about";
  confidence: number;
  mention: string;
}

export interface ActionLinkDecision {
  item: ValidatedMemoryItem;
  plan_item_id: string;
  occurrence_ids: string[];
  aggregation_kind: AggregationKind;
  observation_window_start: string | null;
  observation_window_end: string | null;
  confidence: number;
}

export interface DryRunCandidate {
  item: ValidatedMemoryItem;
  dedupe: DedupeDecision;
  topic_link?: TopicLinkDecision | null;
  entity_links?: EntityLinkDecision[];
  action_link?: ActionLinkDecision | null;
  status: "accepted_dry_run" | "rejected";
  rejection_reason?: string | null;
}

export type MemorizerWriteStatus = "active" | "candidate" | "reject";

export interface WriteDecision {
  candidate: DryRunCandidate;
  status: MemorizerWriteStatus;
  reason: string;
}

export interface PersistedMemoryWrite {
  memory_item_id: string;
  status: "active" | "candidate";
  candidate: DryRunCandidate;
}

export interface MemoryExtractionRunRow {
  id: string;
  user_id: string;
  batch_hash: string;
  prompt_version: string;
  model_name: string;
  status: "running" | "completed" | "failed" | "skipped";
  input_message_ids: string[];
  metadata?: Record<string, unknown>;
}

export interface MessageProcessingRow {
  user_id: string;
  message_id: string;
  extraction_run_id: string;
  processing_role: ProcessingRole;
  processing_status: "completed" | "skipped" | "failed";
  prompt_version: string;
  model_name?: string | null;
  metadata?: Record<string, unknown>;
}

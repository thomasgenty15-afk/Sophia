export type MemoryItemKind =
  | "fact"
  | "statement"
  | "event"
  | "action_observation";

export type MemoryItemStatus =
  | "candidate"
  | "active"
  | "superseded"
  | "invalidated"
  | "hidden_by_user"
  | "deleted_by_user"
  | "archived";

export type SensitivityLevel = "normal" | "sensitive" | "safety";

export type SensitivityCategory =
  | "addiction"
  | "mental_health"
  | "family"
  | "relationship"
  | "work"
  | "financial"
  | "health"
  | "sexuality"
  | "self_harm"
  | "shame"
  | "trauma"
  | "other_sensitive";

export type RetrievalMode =
  | "topic_continuation"
  | "cross_topic_lookup"
  | "safety_first";

export type RetrievalHint =
  | "dated_reference"
  | "correction"
  | "action_related";

export type TopicDecision =
  | "stay"
  | "switch"
  | "create_candidate"
  | "side_note";

export type MemoryItemTopicRelation =
  | "about"
  | "supports"
  | "mentioned_with"
  | "blocks"
  | "helps";

export type MemoryItemEntityRelation = "mentions" | "about";

export type AggregationKind =
  | "single_occurrence"
  | "week_summary"
  | "streak_summary"
  | "possible_pattern";

export type EntityType =
  | "person"
  | "organization"
  | "place"
  | "project"
  | "object"
  | "group"
  | "other";

export type RelationCardinality = "usually_single" | "multiple" | "time_scoped";

export type ChangeOperationType =
  | "invalidate"
  | "supersede"
  | "hide"
  | "delete"
  | "merge"
  | "restore"
  | "promote"
  | "archive_expired"
  | "redaction_propagated";

export type ProcessingRole =
  | "primary"
  | "context_only"
  | "skipped_noise"
  | "reprocessed_for_correction";

export const MEMORY_ITEM_KINDS = [
  "fact",
  "statement",
  "event",
  "action_observation",
] as const satisfies readonly MemoryItemKind[];

export const MEMORY_ITEM_STATUSES = [
  "candidate",
  "active",
  "superseded",
  "invalidated",
  "hidden_by_user",
  "deleted_by_user",
  "archived",
] as const satisfies readonly MemoryItemStatus[];

export const SENSITIVITY_LEVELS = [
  "normal",
  "sensitive",
  "safety",
] as const satisfies readonly SensitivityLevel[];

export const SENSITIVITY_CATEGORIES = [
  "addiction",
  "mental_health",
  "family",
  "relationship",
  "work",
  "financial",
  "health",
  "sexuality",
  "self_harm",
  "shame",
  "trauma",
  "other_sensitive",
] as const satisfies readonly SensitivityCategory[];

export const RETRIEVAL_MODES = [
  "topic_continuation",
  "cross_topic_lookup",
  "safety_first",
] as const satisfies readonly RetrievalMode[];

export const RETRIEVAL_HINTS = [
  "dated_reference",
  "correction",
  "action_related",
] as const satisfies readonly RetrievalHint[];

export const TOPIC_DECISIONS = [
  "stay",
  "switch",
  "create_candidate",
  "side_note",
] as const satisfies readonly TopicDecision[];

export const MEMORY_ITEM_TOPIC_RELATIONS = [
  "about",
  "supports",
  "mentioned_with",
  "blocks",
  "helps",
] as const satisfies readonly MemoryItemTopicRelation[];

export const MEMORY_ITEM_ENTITY_RELATIONS = [
  "mentions",
  "about",
] as const satisfies readonly MemoryItemEntityRelation[];

export const AGGREGATION_KINDS = [
  "single_occurrence",
  "week_summary",
  "streak_summary",
  "possible_pattern",
] as const satisfies readonly AggregationKind[];

export const ENTITY_TYPES = [
  "person",
  "organization",
  "place",
  "project",
  "object",
  "group",
  "other",
] as const satisfies readonly EntityType[];

export const RELATION_CARDINALITIES = [
  "usually_single",
  "multiple",
  "time_scoped",
] as const satisfies readonly RelationCardinality[];

export const CHANGE_OPERATION_TYPES = [
  "invalidate",
  "supersede",
  "hide",
  "delete",
  "merge",
  "restore",
  "promote",
  "archive_expired",
  "redaction_propagated",
] as const satisfies readonly ChangeOperationType[];

export const PROCESSING_ROLES = [
  "primary",
  "context_only",
  "skipped_noise",
  "reprocessed_for_correction",
] as const satisfies readonly ProcessingRole[];

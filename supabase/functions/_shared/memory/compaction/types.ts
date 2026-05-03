import type { MemoryItemKind, SensitivityLevel } from "../types.v1.ts";

export const TOPIC_COMPACTION_PROMPT_VERSION = "memory.compaction.topic.v1";
export const TOPIC_COMPACTION_MODEL_DEFAULT = "gemini-3-flash-preview";

export interface TopicCompactionTopic {
  id: string;
  user_id: string;
  title: string;
  slug?: string | null;
  synthesis?: string | null;
  search_doc?: string | null;
  summary_version?: number | null;
  search_doc_version?: number | null;
  pending_changes_count?: number | null;
  sensitivity_max?: SensitivityLevel | null;
  metadata?: Record<string, unknown> | null;
  status?: string | null;
  lifecycle_stage?: string | null;
}

export interface TopicCompactionMemoryItem {
  id: string;
  user_id: string;
  kind: MemoryItemKind;
  content_text: string;
  normalized_summary?: string | null;
  status: string;
  sensitivity_level: SensitivityLevel;
  observed_at?: string | null;
  source_message_id?: string | null;
  importance_score?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface TopicCompactionClaim {
  claim: string;
  supporting_item_ids: string[];
  sensitivity_level?: SensitivityLevel | null;
}

export interface TopicCompactionOutput {
  synthesis: string;
  search_doc: string;
  claims: TopicCompactionClaim[];
  supporting_item_ids: string[];
  sensitivity_max: SensitivityLevel;
  warnings: string[];
}

export interface TopicCompactionValidationIssue {
  code:
    | "invalid_json"
    | "empty_output"
    | "missing_claim_support"
    | "invalid_supporting_item_id"
    | "unsupported_synthesis_claim"
    | "sensitive_literal_quote"
    | "invalid_sensitivity_max";
  message: string;
  item_id?: string;
}

export interface TopicCompactionValidationResult {
  ok: boolean;
  issues: TopicCompactionValidationIssue[];
  unsupported_claim_count: number;
}

export interface TopicCompactionRunResult {
  status: "completed" | "failed_validation" | "skipped";
  topic_id: string;
  active_item_count: number;
  sensitivity_max: SensitivityLevel;
  unsupported_claim_count: number;
  issues: TopicCompactionValidationIssue[];
  patch?: Record<string, unknown>;
  output?: TopicCompactionOutput;
}

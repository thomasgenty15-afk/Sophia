import type {
  ChangeOperationType,
  MemoryItemKind,
  MemoryItemStatus,
  SensitivityLevel,
} from "../types.v1.ts";

export interface CorrectionMemoryItem {
  id: string;
  user_id: string;
  kind: MemoryItemKind;
  status: MemoryItemStatus | string;
  content_text: string;
  normalized_summary?: string | null;
  domain_keys?: string[] | null;
  sensitivity_level?: SensitivityLevel | null;
  topic_ids?: string[];
  entity_aliases?: string[];
  source_message_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CorrectionTargetResolutionInput {
  user_message: string;
  candidates: CorrectionMemoryItem[];
  explicit_item_id?: string | null;
  previous_payload_item_ids?: string[];
  last_assistant_cited_item_ids?: string[];
  active_topic_id?: string | null;
  mentioned_entities?: string[];
}

export interface CorrectionTargetResolution {
  target_item_id: string | null;
  confidence: number;
  reason: string;
  needs_confirmation: boolean;
  confirmation_prompt?: string | null;
  candidates: Array<{
    item_id: string;
    score: number;
    reason: string;
  }>;
}

export interface CorrectionOperationInput {
  user_id: string;
  item_id: string;
  reason: string;
  source_message_id?: string | null;
  extraction_run_id?: string | null;
  now_iso?: string;
}

export interface SupersedeOperationInput extends CorrectionOperationInput {
  replacement_item_id: string;
}

export interface CorrectionChangeLogRow {
  user_id: string;
  operation_type: ChangeOperationType;
  target_type: "memory_item" | "entity" | "topic";
  target_id: string;
  replacement_id?: string | null;
  source_message_id?: string | null;
  extraction_run_id?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CorrectionOperationResult {
  item_id: string;
  operation_type: "invalidate" | "supersede" | "hide" | "delete";
  status: "invalidated" | "superseded" | "hidden_by_user" | "deleted_by_user";
  purged_payload_item_ids: string[];
  topic_ids: string[];
  change_log: CorrectionChangeLogRow;
}

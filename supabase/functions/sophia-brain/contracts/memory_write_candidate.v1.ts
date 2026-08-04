export type MemoryWriteCandidate = {
  // Skills may emit candidates, but only memory_runtime validates, rejects,
  // queues or writes them. A candidate is not a durable memory proof.
  kind:
    | "statement"
    | "event"
    | "preference"
    | "fact"
    | "action_observation"
    | "correction_note"
    | "risk_signal";
  content_text: string;
  evidence_source_ids: string[];
  confidence_band: "low" | "medium" | "high";
  sensitivity_level: 0 | 1 | 2 | 3 | 4;
  persistence_rationale: string;
  should_persist_default: boolean;
  anti_identity_freeze_checked: boolean;
  topic_hint?: string | null;
  entity_hints?: string[];
  scope_hint?: "moment" | "session" | "topic" | "global";
};

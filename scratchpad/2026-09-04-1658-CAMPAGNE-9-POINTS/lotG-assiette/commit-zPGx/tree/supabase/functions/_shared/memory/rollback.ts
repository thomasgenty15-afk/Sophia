export type MemoryV2RollbackLevel = 1 | 2 | 3 | 4;

export interface MemoryV2RollbackPlan {
  level: MemoryV2RollbackLevel;
  flags_off: string[];
  requires_data_mutation: boolean;
  requires_migration_rollback: boolean;
  expected_recovery: "minutes" | "30_minutes" | "hours";
}

export interface TopicEmbeddingRow {
  id: string;
  status?: string | null;
  search_doc?: string | null;
  search_doc_embedding?: unknown;
  metadata?: Record<string, unknown> | null;
}

export function buildMemoryV2RollbackPlan(
  level: MemoryV2RollbackLevel,
): MemoryV2RollbackPlan {
  if (level === 1) {
    return {
      level,
      flags_off: ["memory_v2_loader_disabled=1"],
      requires_data_mutation: false,
      requires_migration_rollback: false,
      expected_recovery: "minutes",
    };
  }
  if (level === 2) {
    return {
      level,
      flags_off: [
        "memory_v2_memorizer_disabled=1",
        "memory_v2_topic_compaction_enabled",
      ],
      requires_data_mutation: false,
      requires_migration_rollback: false,
      expected_recovery: "minutes",
    };
  }
  if (level === 3) {
    return {
      level,
      flags_off: ["memory_v2_loader_disabled=1", "memory_v2_memorizer_disabled=1"],
      requires_data_mutation: true,
      requires_migration_rollback: false,
      expected_recovery: "30_minutes",
    };
  }
  return {
    level,
    flags_off: [
      "memory_v2_loader_disabled=1",
      "memory_v2_memorizer_disabled=1",
      "memory_v2_topic_compaction_enabled",
      "memory_v2_redaction_job_enabled",
    ],
    requires_data_mutation: true,
    requires_migration_rollback: true,
    expected_recovery: "hours",
  };
}

export function buildMemoryItemQuarantinePatch(args: {
  reason: string;
  now_iso?: string | null;
  previous_metadata?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const nowIso = String(args.now_iso ?? "").trim() ||
    new Date().toISOString();
  return {
    status: "archived",
    valid_until: nowIso,
    metadata: {
      ...(args.previous_metadata ?? {}),
      quarantined: true,
      quarantined_at: nowIso,
      quarantined_reason: String(args.reason ?? "").trim() ||
        "memory_v2_rollback",
    },
  };
}

export function memoryItemStatusIgnoredByLoader(status: unknown): boolean {
  return String(status ?? "") !== "active";
}

export function selectTopicsNeedingSearchDocEmbeddingRebuild(args: {
  topics: TopicEmbeddingRow[];
  model_tag: string;
}): string[] {
  const modelTag = String(args.model_tag ?? "").trim();
  return (args.topics ?? []).flatMap((topic) => {
    if (String(topic.status ?? "active") !== "active") return [];
    if (!String(topic.search_doc ?? "").trim()) return [];
    const metadata = topic.metadata && typeof topic.metadata === "object"
      ? topic.metadata
      : {};
    const memoryV2 =
      metadata.memory_v2 && typeof metadata.memory_v2 === "object"
        ? metadata.memory_v2 as Record<string, unknown>
        : {};
    const existingModel = String(memoryV2.search_doc_embedding_model ?? "")
      .trim();
    if (!topic.search_doc_embedding || existingModel !== modelTag) {
      return [topic.id];
    }
    return [];
  });
}

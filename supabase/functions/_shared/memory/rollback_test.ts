import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildMemoryItemQuarantinePatch,
  buildMemoryV2RollbackPlan,
  memoryItemStatusIgnoredByLoader,
  selectTopicsNeedingSearchDocEmbeddingRebuild,
} from "./rollback.ts";

Deno.test("rollback plans keep flags scoped by severity", () => {
  assertEquals(buildMemoryV2RollbackPlan(1), {
    level: 1,
    flags_off: ["memory_v2_loader_disabled=1"],
    requires_data_mutation: false,
    requires_migration_rollback: false,
    expected_recovery: "minutes",
  });
  assertEquals(buildMemoryV2RollbackPlan(3).requires_data_mutation, true);
  assertEquals(buildMemoryV2RollbackPlan(4).requires_migration_rollback, true);
});

Deno.test("quarantine patch archives items so active-only loader ignores them", () => {
  const patch = buildMemoryItemQuarantinePatch({
    reason: "canary_regression",
    now_iso: "2026-05-03T12:00:00.000Z",
    previous_metadata: { created_by: "test" },
  });
  assertEquals(patch.status, "archived");
  assertEquals(memoryItemStatusIgnoredByLoader(patch.status), true);
  assertEquals((patch.metadata as any).quarantined_reason, "canary_regression");
  assertEquals((patch.metadata as any).created_by, "test");
});

Deno.test("embedding rebuild plan selects active topics with missing or stale model tag", () => {
  assertEquals(
    selectTopicsNeedingSearchDocEmbeddingRebuild({
      model_tag: "gemini-embedding-001@768",
      topics: [
        {
          id: "ok",
          status: "active",
          search_doc: "doc",
          search_doc_embedding: [0.1],
          metadata: {
            memory_v2: {
              search_doc_embedding_model: "gemini-embedding-001@768",
            },
          },
        },
        {
          id: "missing",
          status: "active",
          search_doc: "doc",
          search_doc_embedding: null,
          metadata: {},
        },
        {
          id: "stale",
          status: "active",
          search_doc: "doc",
          search_doc_embedding: [0.2],
          metadata: {
            memory_v2: { search_doc_embedding_model: "old" },
          },
        },
        {
          id: "archived",
          status: "archived",
          search_doc: "doc",
          search_doc_embedding: null,
          metadata: {},
        },
      ],
    }),
    ["missing", "stale"],
  );
});

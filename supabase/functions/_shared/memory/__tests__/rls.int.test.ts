import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

const MIGRATIONS = [
  "20260501090000_create_user_entities.sql",
  "20260501090100_create_memory_items.sql",
  "20260501090200_create_memory_item_sources.sql",
  "20260501090300_create_memory_item_topics.sql",
  "20260501090400_create_memory_item_entities.sql",
  "20260501090500_create_memory_item_actions.sql",
  "20260501090600_create_memory_item_action_occurrences.sql",
  "20260501090700_create_memory_extraction_runs.sql",
  "20260501090800_create_memory_message_processing.sql",
  "20260501090900_create_memory_change_log.sql",
  "20260501091000_extend_user_topic_memories_v2.sql",
  "20260501091100_add_fk_extraction_run_id.sql",
  "20260501091200_create_memory_v2_updated_at_triggers.sql",
  "20260501091300_backfill_user_event_memories.sql",
  "20260501091400_schedule_memory_v2_topic_compaction.sql",
] as const;

const USER_SCOPED_TABLES = [
  "user_entities",
  "memory_items",
  "memory_item_sources",
  "memory_item_topics",
  "memory_item_entities",
  "memory_item_actions",
  "memory_item_action_occurrences",
  "memory_extraction_runs",
  "memory_message_processing",
  "memory_change_log",
] as const;

const TABLE_TO_MIGRATION: Record<
  (typeof USER_SCOPED_TABLES)[number],
  (typeof MIGRATIONS)[number]
> = {
  user_entities: "20260501090000_create_user_entities.sql",
  memory_items: "20260501090100_create_memory_items.sql",
  memory_item_sources: "20260501090200_create_memory_item_sources.sql",
  memory_item_topics: "20260501090300_create_memory_item_topics.sql",
  memory_item_entities: "20260501090400_create_memory_item_entities.sql",
  memory_item_actions: "20260501090500_create_memory_item_actions.sql",
  memory_item_action_occurrences:
    "20260501090600_create_memory_item_action_occurrences.sql",
  memory_extraction_runs: "20260501090700_create_memory_extraction_runs.sql",
  memory_message_processing:
    "20260501090800_create_memory_message_processing.sql",
  memory_change_log: "20260501090900_create_memory_change_log.sql",
};

async function readMigration(file: string): Promise<string> {
  return await Deno.readTextFile(
    new URL(`../../../../migrations/${file}`, import.meta.url),
  );
}

async function readAllMigrations(): Promise<string> {
  const parts = await Promise.all(MIGRATIONS.map(readMigration));
  return parts.join("\n\n");
}

Deno.test("Memory V2 migrations are ordered for FK dependencies", () => {
  assertEquals([...MIGRATIONS], [...MIGRATIONS].sort());
  assert(
    MIGRATIONS.indexOf("20260501090700_create_memory_extraction_runs.sql") <
      MIGRATIONS.indexOf("20260501091100_add_fk_extraction_run_id.sql"),
  );
});

Deno.test("Memory V2 user-scoped tables have user_id and RLS owner policies", async () => {
  for (const table of USER_SCOPED_TABLES) {
    const sql = await readMigration(TABLE_TO_MIGRATION[table]);
    assertStringIncludes(sql, `create table if not exists public.${table}`);
    assertStringIncludes(
      sql,
      "user_id uuid not null references auth.users(id) on delete cascade",
    );
    assertStringIncludes(
      sql,
      `alter table public.${table} enable row level security`,
    );
    assertStringIncludes(sql, `create policy rls_${table}_select_own`);
    assertStringIncludes(sql, "for select");
    assertStringIncludes(sql, "using (auth.uid() = user_id)");
    assertStringIncludes(sql, `create policy rls_${table}_insert_own`);
    assertStringIncludes(sql, "for insert");
    assertStringIncludes(sql, "with check (auth.uid() = user_id)");
    assertStringIncludes(sql, `create policy rls_${table}_update_own`);
    assertStringIncludes(sql, "for update");
  }
});

Deno.test("Memory V2 migrations include required idempotence and integrity constraints", async () => {
  const sql = await readAllMigrations();
  assertStringIncludes(sql, "unique (user_id, batch_hash, prompt_version)");
  assertStringIncludes(sql, "unique (user_id, message_id, processing_role)");
  assertStringIncludes(sql, "nulls not distinct");
  assertStringIncludes(sql, "constraint chk_memory_items_event_has_start");
  assertStringIncludes(
    sql,
    "constraint chk_memory_items_event_end_after_start",
  );
  assertStringIncludes(sql, "constraint chk_memory_item_actions_window");
});

Deno.test("Memory V2 extraction_run_id references are soft FKs", async () => {
  const sql = await readMigration(
    "20260501091100_add_fk_extraction_run_id.sql",
  );
  for (
    const constraint of [
      "fk_memory_items_extraction_run",
      "fk_memory_item_topics_extraction_run",
      "fk_memory_item_entities_extraction_run",
      "fk_memory_item_actions_extraction_run",
      "fk_memory_item_sources_extraction_run",
    ]
  ) {
    assertStringIncludes(sql, constraint);
  }
  assertEquals((sql.match(/on delete set null/g) ?? []).length, 5);
});

Deno.test("Memory V2 updated_at triggers cover mutable V2 tables", async () => {
  const sql = await readAllMigrations();
  for (
    const trigger of [
      "trg_memory_items_set_updated_at",
      "trg_user_entities_updated_at",
      "trg_memory_item_topics_updated_at",
      "trg_memory_item_entities_updated_at",
      "trg_memory_item_actions_updated_at",
      "trg_user_topic_memories_updated_at",
    ]
  ) {
    assertStringIncludes(sql, trigger);
  }
});

Deno.test("Memory V2 event backfill is idempotent and keeps legacy provenance", async () => {
  const sql = await readMigration(
    "20260501091300_backfill_user_event_memories.sql",
  );
  assertStringIncludes(sql, "uniq_memory_items_legacy_event_id");
  assertStringIncludes(sql, "metadata->>'legacy_event_id' = ev.id::text");
  assertStringIncludes(sql, "'legacy_user_event_memories'");
  assertStringIncludes(sql, "insert into public.memory_item_sources");
  assertStringIncludes(sql, "where not exists");
});

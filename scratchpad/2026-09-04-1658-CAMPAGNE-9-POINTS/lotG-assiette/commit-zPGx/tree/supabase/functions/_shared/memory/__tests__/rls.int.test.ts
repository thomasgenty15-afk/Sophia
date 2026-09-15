// Memory V2 schema guards.
//
// W2.D-2 — this file used to read the fifteen `20260501*` / `20260504*` migration files one by
// one. Those files no longer exist: they were folded into `20260522143735_squashed_schema.sql`
// (a `pg_dump` of the applied schema) and the test had been failing with NotFound ever since.
// The guards are re-pointed at the squash, which is now the single source of truth for the
// shape of the memory tables.
//
// Two consequences of reading a dump instead of hand-written migrations:
//   1. identifiers are quoted and keywords are upper-cased, so every assertion runs on a
//      normalised copy (quotes stripped, lower-cased, whitespace collapsed);
//   2. the `user_id` FK and the RLS enablement are separate `ALTER TABLE` statements rather
//      than inline column definitions, so they are asserted as such.
//
// The `drop_memory_v1` migration is gone with the squash: what it used to do is now a
// property of the schema itself, so that guard is INVERTED — it asserts the V1 surfaces are
// absent rather than that a file drops them. That is the only formulation a squash can carry.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

const SQUASHED_SCHEMA = "20260522143735_squashed_schema.sql";

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

const EXTRACTION_RUN_FKS = [
  "fk_memory_items_extraction_run",
  "fk_memory_item_topics_extraction_run",
  "fk_memory_item_entities_extraction_run",
  "fk_memory_item_actions_extraction_run",
  "fk_memory_item_sources_extraction_run",
] as const;

/** pg_dump quotes every identifier and upper-cases keywords; normalise both away. */
function normalizeSql(raw: string): string {
  return raw.replaceAll('"', "").toLowerCase().replace(/\s+/g, " ");
}

let cached: string | null = null;
async function schemaSql(): Promise<string> {
  if (cached === null) {
    cached = normalizeSql(
      await Deno.readTextFile(
        new URL(`../../../../migrations/${SQUASHED_SCHEMA}`, import.meta.url),
      ),
    );
  }
  return cached;
}

Deno.test("Memory V2 schema source exists and is the squash", async () => {
  const sql = await schemaSql();
  assert(sql.length > 100_000, "squashed schema looks truncated");
  assertStringIncludes(sql, "create table if not exists public.memory_items");
});

Deno.test("Memory V2 user-scoped tables have user_id and RLS owner policies", async () => {
  const sql = await schemaSql();
  for (const table of USER_SCOPED_TABLES) {
    assertStringIncludes(sql, `create table if not exists public.${table} (`);
    // user_id is a column of the table…
    assertStringIncludes(sql, "user_id uuid not null");
    // …and carries the cascade FK to auth.users, emitted as its own ALTER by pg_dump.
    assertStringIncludes(
      sql,
      `alter table only public.${table} add constraint ${table}_user_id_fkey ` +
        "foreign key (user_id) references auth.users(id) on delete cascade",
    );
    assertStringIncludes(
      sql,
      `alter table public.${table} enable row level security`,
    );
    for (const verb of ["select", "insert", "update"]) {
      assertStringIncludes(sql, `create policy rls_${table}_${verb}_own`);
    }
  }
  assertStringIncludes(sql, "using ((auth.uid() = user_id))");
  assertStringIncludes(sql, "with check ((auth.uid() = user_id))");
});

Deno.test("Memory V2 schema includes required idempotence and integrity constraints", async () => {
  const sql = await schemaSql();
  assertStringIncludes(sql, "unique (user_id, batch_hash, prompt_version)");
  assertStringIncludes(sql, "unique (user_id, message_id, processing_role)");
  assertStringIncludes(sql, "nulls not distinct");
  assertStringIncludes(sql, "chk_memory_items_event_has_start");
  assertStringIncludes(sql, "chk_memory_items_event_end_after_start");
  assertStringIncludes(sql, "chk_memory_item_actions_window");
});

Deno.test("Memory V2 extraction_run_id references are soft FKs", async () => {
  const sql = await schemaSql();
  for (const constraint of EXTRACTION_RUN_FKS) {
    // A hard FK here would make deleting an extraction run cascade into the memory it
    // produced; `on delete set null` is the invariant, asserted per constraint.
    assertStringIncludes(
      sql,
      `add constraint ${constraint} foreign key (extraction_run_id) ` +
        "references public.memory_extraction_runs(id) on delete set null",
    );
  }
});

Deno.test("Memory V2 updated_at triggers cover mutable V2 tables", async () => {
  const sql = await schemaSql();
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

// INVERTED GUARD (see header). `20260504090000_drop_memory_v1.sql` no longer exists; the
// property it defended is that the V1 memory surfaces are gone from the schema. Asserting
// their absence in the squash is the durable form of the same guarantee — and it goes red the
// day anything reintroduces them.
Deno.test("Memory V2-only: no V1 memory surface survives in the schema", async () => {
  const sql = await schemaSql();
  for (
    const v1Surface of [
      "user_global_memories",
      "user_event_memories",
      "user_topic_enrichment_log",
      "match_global_memories",
    ]
  ) {
    assertEquals(
      sql.includes(v1Surface),
      false,
      `V1 surface is back: ${v1Surface}`,
    );
  }
  // The V1 synthesis columns are gone from user_topic_memories…
  assertEquals(sql.includes("synthesis_embedding"), false);
  // …and the V2 read index that replaced them is present.
  assertStringIncludes(sql, "idx_memory_items_user_status_observed_at");
});

# Memory V2-Only Runbook

Memory V2 is the only durable memory runtime. Memory V1 topic/global/event/scope code and tables are removed.

## Runtime Controls

- `memory_v2_loader_disabled=1` disables durable-memory loading.
- `memory_v2_memorizer_disabled=1` disables durable-memory writing.
- Neither kill-switch re-enables Memory V1. If V2 is disabled or times out, Sophia answers without durable memory.
- Loader timeout defaults to `memory_v2_loader_timeout_ms=1500`.

## Local Verification

1. `deno check supabase/functions/sophia-brain/index.ts supabase/functions/sophia-brain/router/agent_exec.ts supabase/functions/sophia-brain/agents/companion.ts`
2. `deno test --allow-read supabase/functions/_shared/memory/__tests__/v2_only_cleanup_test.ts`
3. `deno test supabase/functions/_shared/memory/runtime/active_loader_test.ts supabase/functions/_shared/v2-memory-retrieval_test.ts supabase/functions/_shared/memory/observability_test.ts`
4. `supabase db reset`
5. `node scripts/seed_memory_v2_fixture.mjs`

## DB Invariant

After reset, these must be absent:

- Tables: `user_global_memories`, `user_event_memories`, `user_topic_enrichment_log`
- Topic V1 columns: `synthesis`, `synthesis_embedding`, `mention_count`, `last_enriched_at`, `last_retrieved_at`, `title_embedding`
- RPCs: `match_topic_memories_by_keywords`, `match_topic_memories_by_synthesis`, `match_topic_memories_by_title`, `match_global_memories`, `match_event_memories`

## Alerts

`MEMORY_V2_ALERT_WEBHOOK_URL` receives critical alerts from `trigger-memory-v2-alerts`.

Critical thresholds:

- non-active item in payload > 0
- statement-as-fact > 0
- cross-user memory access > 0
- p95 cost/user/day > 0.60 EUR
- loader p95 > 2000ms
- memorizer failed/hour > 5

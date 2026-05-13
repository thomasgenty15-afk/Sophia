# Memory V2-Only Runbook

Memory V2 is the only durable memory runtime. Memory V1 topic/global/event/scope
code and tables are removed.

## Runtime Controls

- `memory_v2_loader_disabled=1` disables durable-memory loading.
- `memory_v2_memorizer_disabled=1` disables durable-memory writing.
- Neither kill-switch re-enables Memory V1. If V2 is disabled or times out,
  Sophia answers without durable memory.
- Loader timeout defaults to `memory_v2_loader_timeout_ms=1500`.

## Local Verification

1. `deno check supabase/functions/sophia-brain/index.ts supabase/functions/sophia-brain/router/agent_exec.ts supabase/functions/sophia-brain/agents/companion.ts`
2. `deno test --allow-read supabase/functions/_shared/memory/__tests__/v2_only_cleanup_test.ts`
3. `deno test supabase/functions/_shared/memory/runtime/active_loader_test.ts supabase/functions/_shared/v2-memory-retrieval_test.ts supabase/functions/_shared/memory/observability_test.ts`
4. `supabase db reset`
5. `node scripts/seed_memory_v2_fixture.mjs`
6. `deno test --allow-read supabase/functions/sophia-brain/memory_runtime/memorizer_bridge.test.ts supabase/functions/sophia-brain/memory_runtime/memory_v2_integration_audit.test.ts supabase/functions/sophia-brain/test_harness/llm_as_judge/runner_test.ts`

## S0.1 Isolated Smoke

Run:

```bash
deno test --allow-read supabase/functions/_shared/memory/testing/s0_memory_v2_smoke_test.ts
```

This smoke covers the five S0.1 invariants without the conversation runtime:

- acute self-judgment such as "je suis nul" does not become a `fact`;
- correction operations can supersede the wrong "pere" memory and purge it from
  payload state;
- cannabis extraction is tagged `sensitive` (`SensitivityLevel` enum, equivalent
  to S0's high sensitivity band);
- retrieval returns the active "marche" item through the Memory V2 loader
  boundary;
- replaying the same memorizer batch is skipped by `batch_hash`.

## S7 Conversation Runtime Audit

S7 adds the conversation-runtime guardrail between skills/tools/operations and
the async memorizer:

- `memory_runtime/memorizer_bridge.ts` validates the strict
  `MemoryWriteCandidate` schema before queueing;
- candidates without evidence, unchecked anti-identity-freeze, or acute
  identity-freezing `fact` writes are rejected before Memory V2 persistence;
- medium or higher safety pregate only allows `risk_signal` candidates;
- retried source messages dedupe on `user_id/source_message_id/kind/content`;
- `correction_note` candidates invalidate matching immediate payload items
  before the next retrieval, including the five relation-correction cases in the
  audit;
- operation outcomes can be represented as `action_observation` candidates with
  `buildOperationActionObservationCandidate`.

The S7 audit suite covers:

- immediate "pere -> frere" correction and five relation variants;
- cannabis memories with sensitivity >= 3 excluded from neutral execution
  breakdown context;
- acute statements such as "je suis nul je rate tout" kept as non-persisting
  `statement` candidates while forbidden `fact` candidates are rejected;
- sticky active topic not forcing cannabis context into a neutral walk response;
- idempotent retry behavior;
- delete-user retention windows: 90 days for memory items, 365 days for change
  logs.

The LLM-as-judge harness is injectable. Local tests use the deterministic
heuristic provider over 30 fixtures so CI does not need network access. A real
Gemini 3 Flash provider can be passed into `runLlmJudgeDataset` at staging time.

## DB Invariant

After reset, these must be absent:

- Tables: `user_global_memories`, `user_event_memories`,
  `user_topic_enrichment_log`
- Topic V1 columns: `synthesis`, `synthesis_embedding`, `mention_count`,
  `last_enriched_at`, `last_retrieved_at`, `title_embedding`
- RPCs: `match_topic_memories_by_keywords`, `match_topic_memories_by_synthesis`,
  `match_topic_memories_by_title`, `match_global_memories`,
  `match_event_memories`

## Alerts

`MEMORY_V2_ALERT_WEBHOOK_URL` receives critical alerts from
`trigger-memory-v2-alerts`.

Critical thresholds:

- non-active item in payload > 0
- statement-as-fact > 0
- cross-user memory access > 0
- p95 cost/user/day > 0.60 EUR
- loader p95 > 2000ms
- memorizer failed/hour > 5

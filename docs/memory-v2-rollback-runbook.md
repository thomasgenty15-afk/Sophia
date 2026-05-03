# Memory V2 Rollback Runbook

## Scope

This runbook covers Memory V2 runtime retrieval, memorizer writes, topic compaction, redaction propagation, weekly review, and operational alerts.

## Pre-Checks

1. Run `npm run memory_v2_eval`.
2. Check `trigger-memory-v2-alerts` over the last 24h for the affected user or cohort.
3. Confirm whether the issue is runtime-only, write-related, data-related, or schema-related.

## Level 1 - Disable Runtime Loader

Use when loader latency, topic routing, cross-topic retrieval, or sensitive injection policy regresses.

Flags:

```text
memory_v2_loader_enabled=0
```

Expected result: runtime falls back to the legacy memory loader while durable V2 rows stay untouched.

Verification:

1. Send a small-talk turn such as `Hello`.
2. Confirm `memory.runtime.active.loaded` stops for the user or cohort.
3. Confirm normal conversation still works through legacy context.

## Level 2 - Stop Durable Writes

Use when extraction quality regresses: statement-as-fact, duplicates, bad entity links, or noisy action observations.

Flags:

```text
memory_v2_memorizer_enabled=0
memory_v2_topic_compaction_enabled=0
```

Optional:

```text
memory_v2_memorizer_dry_run_enabled=1
```

Expected result: new write proposals can still be audited, but no new durable Memory V2 items are written.

Verification:

1. Retry a completed batch and confirm idempotent skip.
2. Confirm no new rows in `memory_items` for the suspect run.
3. Confirm dry-run metadata remains available in `memory_extraction_runs`.

## Level 3 - Quarantine Recent Rows

Use when a known extraction window produced bad rows.

Procedure:

1. Disable runtime and memorizer flags.
2. Identify suspect `memory_extraction_runs` by user/time/prompt version.
3. Archive affected rows:

```sql
update public.memory_items
set
  status = 'archived',
  valid_until = now(),
  metadata = metadata || jsonb_build_object(
    'quarantined', true,
    'quarantined_at', now(),
    'quarantined_reason', 'canary_regression'
  )
where extraction_run_id in (<suspect_run_ids>);
```

4. Insert `memory_change_log` audit rows if user-visible data was affected.
5. Run topic compaction/redaction for impacted topics if synthesis/search_doc may contain bad claims.

Verification:

1. Confirm active loader ignores archived rows.
2. Confirm `memory_v2_eval` still passes.
3. Confirm no deleted/archived IDs appear in the next payload.

## Level 4 - Schema Rollback

Use only if schema constraints or migrations break production writes.

Procedure:

1. Disable all Memory V2 flags.
2. Export affected Memory V2 tables for audit.
3. Roll back migrations in reverse order.
4. Re-run RLS/integrity tests before enabling any feature again.

## Search Doc Embedding Rebuild

Use after embedding model/tag change or a failed backfill.

1. Select active topics where `search_doc` is non-empty and `metadata.memory_v2.search_doc_embedding_model` is stale or missing.
2. Run `backfill-memory-v2-topic-embeddings` with a forced topic list or small batch.
3. Confirm `search_doc_embedding` and model tag are populated.

## Alert Triage

Critical alerts:

- `invalid_injection_count`
- `statement_as_fact_violation_count`
- `deleted_item_in_payload`
- `cross_user_memory_access`
- `compaction_unsupported_claim_rate`
- `memory_none_item_count`

Warning alerts:

- `dispatcher_plan_missing_count`

For any critical privacy alert, disable `memory_v2_loader_enabled` first, then investigate.

# Memory V2 Coexistence Policy

This note documents the Sprint 3 coexistence rules between the existing V1 memory surfaces and Memory V2.

## V1 Tables Kept

- `user_global_memories` remains a V1 table through the MVP rollout. Memory V2 may read it later to avoid duplicate extraction, but must not write to it.
- `user_topic_enrichment_log` remains V1 historical audit data. Memory V2 does not migrate or mutate it in Sprint 3.
- `user_event_memories` remains available for audit after backfill. Historical rows are copied into `memory_items` as `kind = 'event'` with `metadata.legacy_event_id` and a `memory_item_sources` provenance row.

## V2 Tables And Extensions

- New durable memory writes go to `memory_items` and targeted link tables only.
- `user_topic_memories` is extended in place because V1 already uses it as the living topic table. V2 writes only the V2 extension fields: `lifecycle_stage`, `search_doc`, `search_doc_embedding`, `search_doc_version`, `pending_changes_count`, `last_compacted_at`, `summary_version`, `sensitivity_max`, `archived_reason`, and `merged_into_topic_id`.
- `topic_memory_links` must not be created. It is superseded by `memory_item_topics`.

## Runtime State

- `chat_messages.metadata.topic_context` stays JSON-compatible with V1. V2 must add versioned fields such as `version`, `router_version`, `decision`, `confidence`, and `previous_topic_id` without removing fields V1 readers depend on.
- `user_chat_states.temp_memory` uses versioned keys. V1 keys and V2 keys may coexist:
  - V1: `__active_topic_state_v1`
  - V2: `__active_topic_state_v2`, `__memory_payload_state_v2`

## Embedding Model

Memory V2 topic search document embeddings use `gemini-embedding-001@768`, matching Sprint 0. The backfill job stores the model tag under `user_topic_memories.metadata.memory_v2.search_doc_embedding_model`.

## Guardrails

- No destructive changes to V1 tables during MVP rollout.
- No Memory V2 writes to `user_global_memories`.
- No normal Memory V2 loader path may inject memory rows unless `memory_items.status = 'active'`.

# Memory Architecture

Sophia now runs Memory V2-only.

Durable memory lives in atomic `memory_items` with auditable links through `memory_item_sources`, `memory_item_topics`, `memory_item_entities`, `memory_item_actions`, and `memory_change_log`.

`user_topic_memories` remains as the V2 topic surface, but `search_doc` is the conversational/retrieval surface. Legacy topic synthesis columns are removed.

There is no fallback to Memory V1. On loader failure or timeout, the main chat path continues without durable memory.

Legacy global/event/topic V1 summaries are intentionally not migrated into `memory_items`; importing interpreted summaries would carry forward drift and hallucinated relationships.

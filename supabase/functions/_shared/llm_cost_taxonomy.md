# LLM Cost Taxonomy

This taxonomy standardizes `llm_usage_events.operation_family` and `operation_name`
to keep admin cost analytics stable over time.

## Families

- `dispatcher`
- `message_generation`
- `embedding`
- `plan_generation`
- `sort_priorities`
- `summarize_context`
- `ethics_check`
- `memorizer`
- `watcher`
- `scheduling`
- `duplicate_check`
- `other`

## Mapping Rules

The logger infers family from `source` if callsites do not provide explicit values:

- sources containing `dispatcher` -> `dispatcher`
- containing `sort-priorities` -> `sort_priorities`
- containing `summarize-context` or `summary` -> `summarize_context`
- containing `ethical` -> `ethics_check`
- containing `memorizer` or `topic_memory` -> `memorizer`
- containing `watcher` -> `watcher`
- containing `schedule`, `checkin`, or `reminder` -> `scheduling`
- containing `duplicate` -> `duplicate_check`
- containing `generate-plan` -> `plan_generation`
- containing `embed` -> `embedding`
- fallback -> `other`

For critical callsites, pass explicit `operation_family` and `operation_name`.

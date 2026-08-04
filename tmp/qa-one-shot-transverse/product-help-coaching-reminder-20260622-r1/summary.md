# Summary - product-help-coaching-reminder-20260622-r1

- Endpoint: local `/functions/v1/test-send-message`
- Flags: `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`
- User QA: `qa-qa-skill-ph-coach-reminder-product-help-coaching-reminder-20260622-r1@example.com`
- User id: `df0dde37-1cd2-4c7f-9478-09736f2a19de`
- Cleanup: complete via `scripts/qa-cleanup-run-connection.sh`
- Raw: `raw.jsonl`
- DB snapshots: `durable.json`, `db-after.json`, `db-traces.json`

## Turns

| Turn | HTTP | Owner | Handler | Direct effects frame | Direct effects to run | Tool execution | Durable reminder | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 200 | `product_help` | `product_help` | none | none | `none` | none | green |
| T2 | 200 | `product_help` | `product_help` | none | none | `none` | none | green |
| T3 | 200 | `product_help` | `product_help` | `create_one_shot_reminder` | `create_one_shot_reminder` | `none` | none | red |
| T4 | 200 | `product_help` | `product_help` | none | none | `none` | none | green |
| T5 | 200 | `product_help` | `product_help` | none | none | `none` | none | green |
| T6 | 200 | `product_help` | `product_help` | none | none | `none` | none | green |

## Post-Run DB

- `user_chat_states.temp_memory.__active_skill_state`: `null`
- `scheduled_checkins`: `0`
- `chat_messages`: `12`
- `conversation_turn_traces` REST query: HTTP 200, `0` rows; inline traces from `/test-send-message` were saved in `raw.jsonl`.

## Main Finding

T3 detected both `skill_signals.product_help` and `direct_effects.create_one_shot_reminder`; route decision also listed `direct_effects_to_run=["create_one_shot_reminder"]`. However, no tool executed, the EffectLedger remained empty, and no `scheduled_checkins` row was created. The visible response did not falsely claim the reminder was programmed.

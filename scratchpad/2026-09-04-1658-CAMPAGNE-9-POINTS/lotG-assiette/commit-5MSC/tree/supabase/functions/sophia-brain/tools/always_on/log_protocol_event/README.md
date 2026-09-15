KEEL W4.3 — durable effect `log_protocol_event`: writes one FACT row into
`protocol_events`. Fork of `track_progress_plan_item` (unmutated). Chain:
contract -> intake -> gate -> executor (write-through) -> ledger -> renderer.
Runtime wiring is W4.4.

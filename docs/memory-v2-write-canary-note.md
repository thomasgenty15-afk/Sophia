# Memory V2 Write Canary

Date: 2026-05-01

Sprint 7 introduces durable Memory V2 writes behind `memory_v2_memorizer_enabled`.

Rollout rule:

- deterministic 5% user segment using `user_id` hash bucket;
- keep dry-run available through `memory_v2_memorizer_dry_run_enabled`;
- do not expand beyond 5% before Sprint 8 correction/redaction is implemented.

Required gates before moving to 25%:

- `statement_as_fact_violations = 0`;
- `invalid_injection_simulated_count = 0`;
- duplicate rate `< 5%`;
- cost per active user remains within target budget;
- candidate promotion job has run successfully for 72h.

Rollback:

- set `memory_v2_memorizer_enabled=false`;
- keep dry-run enabled for diagnostics if needed.

# Bug sheet — 2026-06-24 — seven dispatchers R1

## Scope

QA campaign: `2026-06-24-seven-dispatchers-r1`

Reference report:

- `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-24-seven-dispatchers-r1.md`

Coverage:

- Global dispatcher
- Product help local dispatcher
- Coaching recommendation local dispatcher
- Feature opportunity local dispatcher
- Safety crisis local dispatcher
- Daily action review local dispatcher
- Weekly active review local dispatcher

## Bugs

### R1-B01 — Daily bridge return is functionally complete but trace is not canonical

Status: open

Severity: medium

Family: `BF-TEST-01` — test/observability gap

Surface:

- Daily action review
- Coaching recommendation bridge return
- WhatsApp pending flow

Run:

- `qa7-daily-action-review-20260624-r1`

Observed:

- Tour 0 daily opening was generated from process-checkin/pending path.
- Tour 1 correctly exited daily toward `coaching_recommendation`.
- Tour 2 committed the daily review data and completed the pending check-in.
- Runner still reported `return_observed=false`.
- Tour 2 trace did not expose a clean canonical return marker comparable to the bridge activation marker.

Expected:

- When a child flow returns to daily and the daily completes, the trace should expose a canonical return/completion marker.
- The QA runner should be able to assert return without inferring it from DB side effects only.

Evidence:

- `bridge_observed: true`
- `return_observed: false`
- `final_pending_status: done`
- `entries_before_cleanup: 3`

Impact:

- Functional user path appears correct.
- QA confidence is degraded because the run cannot prove the bridge return through the same canonical trace layer used for routing assertions.

Suggested fix:

- Add or normalize a canonical daily return marker in the trace/metadata for pending WhatsApp daily flow.
- Update the daily bridge QA runner to assert that marker.

Acceptance test:

- Relaunch the same daily bridge scenario.
- Expected result: `bridge_observed=true`, `return_observed=true`, pending status `done`, daily entries committed, and no inference-only pass.

### R1-B02 — Weekly active review run used a direct-Deno harness whose env was not aligned with served Supabase functions

Status: open

Severity: high

Family: `BF-TEST-01` — test/harness setup failure

Surface:

- Weekly active review
- Process-checkin/proactive opening path
- Local QA harness environment

Run:

- `qa7-weekly-20260624-r1`

Observed:

- Weekly setup attempted to create a real weekly opening before sending user turns by importing shared weekly code directly from a Deno CLI harness.
- The run failed before Tour 0 after 10 attempts.
- Error in that Deno CLI process: `OPENAI_API_KEY missing`.
- No weekly user turn was sent.

Expected:

- Weekly should be triggered through process-checkin/proactive opening path.
- Tour 0 should establish weekly as active owner.
- Subsequent user turns should be sent through the real local Sophia IA path.
- The QA path should use the same served-function env injection as the rest of the local Sophia runtime, or explicitly load the same env before calling shared code directly.

Evidence:

- No Tour 0 assistant opening generated.
- No `/test-send-message` continuation against active weekly state was possible.
- Temporary Auth user created by the failed setup was deleted during cleanup.

Impact:

- Weekly remains unverified in this 7-surface campaign.
- Overall campaign verdict must stay `RED` because one required dispatcher did not produce a valid run.
- This is not evidence that `/test-send-message`, process-checkins served by Supabase, or the broader Sophia IA runtime lacked an LLM key. The other runs prove the served runtime could call LLM providers.

Suggested fix:

- Prefer relaunching weekly from the real served `process-checkins` path, then continue via `/test-send-message` with active weekly owner.
- If a direct-Deno setup remains necessary, make it explicitly load the same env as the served Supabase functions before calling `generateWeeklyAdaptiveReviewOpening`.

Acceptance test:

- Weekly run includes Tour 0 proactive opening.
- Active owner is weekly after opening.
- At least one continuation turn is handled by weekly active review.
- One-shot reminder/direct-effect lane and allowed exits remain observable if covered by the scenario.

## Non-bugs / discarded attempts

### Global attempt routed to coaching recommendation

Run:

- `qa7-global-20260624-r1`

Reason discarded:

- The message contained a real coaching intent.
- Routing to `coaching_recommendation` was valid behavior, so the attempt was not counted as global dispatcher coverage.

### Feature opportunity attempt routed to product help

Run:

- `qa7-feature-opportunity-20260624-r1`

Reason discarded:

- The prompt was product/help-shaped.
- Routing to `product_help` was valid behavior, so the attempt was not counted as feature opportunity coverage.

# Bug Sheet — BF-TEST-01 — Daily Action Review Real QA Blocked

## Summary

The daily action review real QA run could not validate the new local dispatcher because the local scheduled-checkin runtime failed before creating the `daily_action_review` pending action.

## Run

- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-09-daily-action-review-local-dispatcher-real-invalid-r1.md`
- Run id: `daily-action-review-local-dispatcher-real-20260609202159-r1`
- Persona: Rose

## Evidence

- QA scheduled check-in was created for `action_evening_review_v2`.
- `process-checkins` saw due check-ins but processed an unrelated recurring reminder first.
- Edge logs showed `JWSSignatureVerificationFailed: signature verification failed`.
- No `whatsapp_pending_actions` row was created for Rose after the run.
- The daily action review local dispatcher was never reached.

## Impact

The implementation cannot be certified by real QA yet. Unit tests passed before this run, but the end-to-end runtime path from scheduled review opening to active local flow remains unproven.

## Expected Behavior

For an `action_evening_review_v2` scheduled check-in with valid occurrence targets:

- `process-checkins` generates a daily action review opening.
- `whatsapp-send` succeeds in local simulation.
- `process-checkins` inserts `whatsapp_pending_actions.payload.chat_capability = daily_action_review`.
- The next WhatsApp inbound reply is routed to the local daily action review dispatcher, not the global dispatcher.

## Recommended Fix

- Align local Edge JWT/service-role configuration so internal calls from `process-checkins` to `whatsapp-send` verify correctly.
- Provide a QA-safe way to isolate or prioritize the scheduled check-in under test, so unrelated due reminders do not consume the run.
- Re-run the daily action review real QA after the runtime setup can create the pending action.

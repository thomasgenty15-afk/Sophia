# QA Run Report — Daily Action Review Local Dispatcher — Real Run Invalid R1

## 1. Context

- Date: 2026-06-09
- Flow under test: `daily_action_review_v1`
- Runtime path targeted: `process-checkins` -> WhatsApp scheduled check-in -> `whatsapp_pending_actions` -> `whatsapp-webhook` pending reply path
- Persona: Rose, local persona fixture
- Run id: `daily-action-review-local-dispatcher-real-20260609202159-r1`
- Guidelines followed:
  - `docs/agent-playbook/New/test-material/01-qa-run-report-structure.md`
  - `docs/agent-playbook/New/test-material/14-qa-test-guidelines.md`

This run did not reach the conversational local dispatcher turn. It is therefore invalid as proof of the new local dispatcher changes.

The setup was dynamic from current local DB state. Selected action review targets:

- `Faire un sas de décompression (sans fumer)` — occurrence `3be65289-e810-4a73-b48a-26e0fc8b45ac`
- `Préparer un plan anti-ennui` — occurrence `91831b6e-782b-489b-88a3-6bc44a00fa67`

No code correction was made during the QA run. Only a temporary runner under `tmp/` was used to prepare/capture/cleanup the QA state.

## 2. Conversation Turns

No valid conversation turn happened.

Expected first visible opening:

- `process-checkins` should send the daily action review opening.
- It should insert `whatsapp_pending_actions` with `kind = scheduled_checkin` and `payload.chat_capability = daily_action_review`.
- The next user reply should go through `whatsapp-webhook` -> pending handler -> local dispatcher -> reducer -> stage-specific visible prompt.

Observed:

- A QA scheduled check-in was inserted for `event_context = action_evening_review_v2`.
- `process-checkins` did not create a daily action review pending action.
- `whatsapp_pending_actions` for Rose remained empty after the attempt.
- No user reply was sent because there was no valid pending daily review to answer.

## 3. Human Fluidity

Not assessable.

The user-facing daily review conversation never started. The only outbound message produced during the run was from an unrelated pending recurring reminder already present in the local queue, not from the daily action review check-in.

## 4. System Analysis

### Runtime Evidence

Relevant traces observed:

- `process-checkins` logs showed `due_checkins=8` for request id `daily-action-review-local-dispatcher-real-20260609202159-r1-process`.
- The same run produced a WhatsApp-simulated outbound for an unrelated recurring reminder.
- Edge logs also showed `JWSSignatureVerificationFailed: signature verification failed` around internal function calls.
- A second `process-checkins` call returned `{"success":true,"processed":0,...}` while logs showed `due_checkins=5`.
- DB capture after the run showed:
  - QA scheduled check-in still not converted into a daily pending action.
  - `whatsapp_pending_actions` for Rose: `[]`.

### Doctrine Checks

- Global dispatcher skipped while flow active: not testable, flow never became active.
- No regex routing: not exercised.
- No deterministic renderer: not exercised.
- No single generic conversation agent: not exercised.
- Every flow action has exact continuation: not exercised.
- `stop_local_no_handoff`: not exercised.
- `exit_to_global_dispatcher` note information: not exercised.
- `safety_preempt`: not exercised.
- Conversation agent only uses `conversation_context`: not exercised.
- `micro_memory_context` minimal and not leaked raw: not exercised.

### Cleanup

Targeted cleanup completed:

- Restored Rose profile fields:
  - `whatsapp_last_inbound_at`
  - `whatsapp_last_outbound_at`
  - `whatsapp_opted_in`
- Deleted QA scheduled check-in `9caa8425-29ed-423a-b514-f6582386d409`.
- Deleted the unrelated simulated assistant message created as a side effect of this run.
- Restored the existing recurring reminder check-in touched by this run to `pending`.

Verification after cleanup:

- QA check-in query returned `[]`.
- Side-effect message query returned `[]`.
- Rose profile WhatsApp timestamps returned to `null`.

## 5. Global Verdict

Verdict: RED / INVALID RUN.

Reason: the real runtime setup did not reach the local daily action review dispatcher. The QA cannot validate the new dispatcher/reducer/visible prompt changes until the local scheduled-checkin runtime can reliably create the `daily_action_review` pending action.

Bug family: `BF-TEST-01` — real QA runtime blocked by local scheduling/Internal Edge instability.

Required next run:

- Start from a clean due queue or isolate the QA scheduled check-in.
- Ensure local Edge internal calls use the same local JWT/service-role configuration as Kong.
- Re-run `process-checkins` until it creates a pending action with `payload.chat_capability = daily_action_review`.
- Only then send the first user reply through `whatsapp-webhook` and evaluate the local dispatcher traces.

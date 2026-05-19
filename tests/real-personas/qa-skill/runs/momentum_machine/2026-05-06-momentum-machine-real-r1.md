# Momentum machine real run - 2026-05-06 r1

## Setup

- Runner: `tests/real-personas/qa-skill/runs/momentum_machine/run_momentum_machine_real_2026_05_06.mjs`
- Endpoint: local Supabase Edge Function `test-send-message`
- Persona connection: `qa-skill/connections/emotional_repair.json`
- Scope: `qa-momentum-machine-real-2026-05-06-r1`
- Channel: `web`
- Reset: none. Isolation is by unique scope.

## Scenario

12 planned turns:

1. Start work on a client presentation.
2. Show initial traction.
3. Report concrete progress.
4. Hit a block.
5. Describe avoidance.
6. Minimal reply.
7. Strong emotional load.
8. Ask for emotional support, not a plan.
9. Reopen the document for one minute.
10. Close consent for tonight.
11. Reopen softly for tomorrow.
12. Set a micro-action.

## Result

- Turns attempted: 12
- Turns recorded: 10
- Successful turns: 9
- Stop point: turn 10 returned `502` from the local Edge gateway.
- Observability events captured: 66
- Momentum events captured: 12

Files:

- Raw: `tests/real-personas/qa-skill/runs/momentum_machine/2026-05-06-momentum-machine-real-r1.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/momentum_machine/2026-05-06-momentum-machine-real-r1.summary.json`
- Proof: `tests/real-personas/qa-skill/runs/momentum_machine/2026-05-06-momentum-machine-real-r1.proof.json`

## Momentum Findings

The runtime machine did execute in real conditions: each successful turn went through the local Edge Function, persisted chat state, and emitted `memory_observability_events`.

Observed sequence:

- Turns 1-6: state remained `friction_legere`, reason `engaged_but_not_clearly_progressing`.
- Turn 6: engagement dropped from `high` to `medium` on minimal reply `ok`.
- Turn 7: state transitioned from `friction_legere` to `soutien_emotionnel`, reason `emotional_load_high`.
- Turn 7 also emitted `momentum_transition_confirmed`.
- Turns 8-9: state stayed `soutien_emotionnel`, while the machine opened a pending transition back to `friction_legere`.
- Pending transition confirmations increased from 1 to 2 after the user showed readiness to reopen the document.

Final persisted state after the last successful turn:

- State: `soutien_emotionnel`
- Reason: `emotional_load_high`
- Recommended posture: `support`
- Engagement: `high`
- Execution traction: `unknown`
- Emotional load: `medium`
- Consent: `open`

## Issues Found

1. The real flow fails on the consent-close turn with a `502`.
   - Input: `stop pour ce soir, pas aujourd'hui, on reprendra plus tard`
   - This prevented validation of the expected `pause_consentie` transition in the end-to-end path.
   - Unit coverage for `pause_consentie` still passes, so the failure is probably in the full request path or an upstream dependency, not in the pure classifier.

2. The official `scripts/export_momentum_audit_bundle.mjs` failed locally with `401 Missing authorization header`.
   - It sends `X-Internal-Secret`, but the local gateway also requires `Authorization`.
   - The direct DB proof is usable, but the audit export script is not currently reliable in this local setup.

## Verification

Targeted tests passed:

```text
deno test --allow-env --allow-read \
  supabase/functions/sophia-brain/momentum_state_v2_test.ts \
  supabase/functions/_shared/momentum-observability_test.ts \
  supabase/functions/sophia-brain/lib/momentum_trace_test.ts

14 passed | 0 failed
```

## Conclusion

The machine is testable in real runtime, and the core behavior is visible:

- It reacts to engagement quality.
- It escalates correctly into emotional support.
- It resists immediately leaving emotional support and uses pending transitions.
- It emits traceable observability events.

Main blocker before calling it fully validated: the end-to-end consent-close path needs debugging because the real request fails before the momentum state can be persisted.

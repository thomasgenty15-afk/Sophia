# Bug sheet — 2026-06-24 — one-shot reminder seven flows R1

## Scope

Report:

- `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-24-one-shot-reminder-seven-flows-r1.md`

Objective:

- Verify `create_one_shot_reminder` across global dispatcher and six local flow surfaces.

Observed summary:

- Green: global, product help, coaching recommendation, feature opportunity, weekly active review.
- Red: daily action review pending path, safety active path.
- Yellow warning: weekly trace duplicates the same committed effect in one trace projection.

## Bugs

### R1-B01 — Daily pending path ignores explicit one-shot reminder while continuing daily review

Status: open

Tours:

- Daily Tour 1

Famille:

- `BF-AGENDA-01` — multi-intention incomplete

Domaine owner:

- `whatsapp-webhook` pending daily path
- `daily_action_review_v1`
- direct-effect transverse integration

Source amont:

- Pending WhatsApp daily handling before/around local dispatcher execution.
- The request does not appear to enter the standard direct-effect lane.

Symptome visible:

- User asks: "Rappelle-moi demain à 20h de vérifier mon bilan daily..."
- Sophia continues the daily review and asks clarification for one action.
- Sophia never confirms or asks about the reminder.

Preuve systeme:

- `pending_status=pending`
- `review_status=needs_clarification`
- no `direct_effects` exposed in pending trace
- no `executed_tools`
- no one-shot `scheduled_checkins` observed for that run
- daily entries later commit normally after clarification, so the daily path itself stayed alive

Correction attendue:

- The daily pending path must run or expose `create_one_shot_reminder` through the same direct-effect lane used by `runConversationRouters`.
- The daily local flow should keep handling the review while the direct-effect lane commits or blocks the reminder independently.
- Visible daily response should confirm only if `direct_effect_confirmation_context.has_committed_one_shot_reminder=true`.

Statut:

- open

Fix reference:

- none

Tests requis:

- Positive: pending daily user response contains one-shot reminder + daily outcome; expected reminder committed and daily continues/commits.
- Paraphrase: "préviens-moi demain soir de revoir ce bilan..." during daily pending.
- Anti-faux-positif: "j'ai passé 20 minutes dessus" must not create a reminder.
- Integration: WhatsApp pending daily via `process-checkins` + `whatsapp-webhook`, not direct `processMessage`.

### R1-B02 — Safety active flow detects one-shot reminder but validator blocks with missing_time despite relative delay

Status: open

Tours:

- Safety Tour 2

Famille:

- `BF-INTAKE-01` — slot fourni mais redemande / bloque

Domaine owner:

- direct-effect lane
- `create_one_shot_reminder` validator/intake
- safety active-flow integration

Source amont:

- The safety local dispatcher produces a valid local direct-effect request, but the lane validator rejects it.

Symptome visible:

- User asks inside safety: "Rappelle-moi dans 30 minutes d'envoyer un message à ma soeur..."
- Sophia continues safety support but does not confirm the reminder.

Preuve systeme:

- route_reason: `active_safety_crisis_with_local_direct_effects`
- direct_effects: `create_one_shot_reminder`
- direct_effects_to_run: `create_one_shot_reminder`
- payload_hint.when_hint: `dans 30 minutes`
- payload_hint.instruction_hint: `envoyer un message à ma soeur`
- direct_effect_lane.blocked_effects: `reason_code=missing_time`
- tool_execution: `blocked`
- no durable `scheduled_checkins`

Correction attendue:

- The one-shot reminder validator must accept actionable relative delays supplied by the local dispatcher, including inside active safety.
- Safety ownership must remain active while the direct-effect lane commits or blocks independently.
- If the reminder is blocked for a real reason, the blocked reason must match the actual missing/invalid slot.

Statut:

- open

Fix reference:

- none

Tests requis:

- Positive: active safety + "dans 30 minutes de..." commits a one-shot reminder and continues safety response.
- Paraphrase: "dans une demi-heure..."
- Anti-faux-positif: "reste avec moi deux minutes" must not create a reminder.
- Safety invariant: safety owner remains `safety`, no non-safety local flow steals the turn.

### R1-B03 — Weekly trace duplicates the same committed one-shot effect in `turn_frame.direct_effect_lane`

Status: open

Tours:

- Weekly Tour 1

Famille:

- `BF-TEST-01` — trace/test incoherent

Domaine owner:

- direct-effect trace projection
- weekly active runtime trace serialization

Source amont:

- `turn_frame.direct_effect_lane` projection duplicates `requested_effects` and `committed_effects`.
- `tool_skill_run.direct_effect_lane` exposes the single expected committed effect.

Symptome visible:

- No user-visible issue; response confirms once and continues weekly.

Preuve systeme:

- `turn_frame.direct_effect_lane.committed_effects` contains the same reminder id twice.
- `tool_skill_run.direct_effect_lane.committed_effects` contains one entry.
- durable reminder id: `f82a5059-7762-43e5-8360-f5b391530d36`

Correction attendue:

- Normalize/dedupe direct-effect trace projections so QA assertions can rely on one canonical committed effect list.
- Keep visible confirmation sourced from `direct_effect_confirmation_context`.

Statut:

- open

Fix reference:

- none

Tests requis:

- Unit/contract trace test: one committed reminder id appears once in canonical trace projection.
- Integration weekly one-shot: committed DB row exists once, visible confirmation appears once, active weekly continues.

## Non-bugs / notes

### Static `client_now_iso` in normal runner

The normal conversation runner used for global/product/coaching/feature/safety sends `client_now_iso=2026-05-22T10:00:00.000+02:00` by default. Therefore "demain" produced reminders scheduled on 2026-05-23 in those runs.

This campaign uses those runs to verify direct-effect detection, execution, durable creation, and local-flow continuation. It should not be used as a current-date scheduling validation.

### Cleanup warning on `user_memories`

The normal cleanup reports `user_memories` as `404` in local DB, while `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, and `auth.users` cleanup succeeded. This is a cleanup-table availability warning, not a failure of the one-shot reminder tests.

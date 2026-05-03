# Momentum V2 - inventory for actions/events base

Date: 2026-04-28

## Goal

Reposition momentum as a read-only analysis and decision layer on top of the new
dated-action system. It must not become a competing WhatsApp scheduler.

## Reusable pieces

- `sophia-brain/momentum_state.ts`: useful public labels/postures and some
  classification ideas, but current implementation is still tied to
  `user_chat_states.temp_memory.__momentum_state_v2` and older runtime inputs.
- `sophia-brain/momentum_morning_nudge.ts`: reusable as tone/posture logic only.
  It is no longer the source of truth for morning scheduling.
- `sophia-brain/momentum_outreach.ts`: useful intervention shapes, but should
  not emit outreach until the V2 snapshot produces a clear intervention.
- `sophia-brain/conversation_pulse_builder.ts`: useful risk/tone signal. The new
  snapshot reads latest `conversation_pulse` as an optional risk amplifier.
- `sophia-brain/repair_mode_engine.ts`: keep as a downstream safety mechanism
  for high-risk states, not as a scheduler.
- `sophia-brain/coaching_intervention_selector.ts`: keep as future consumer for
  dashboard-oriented recommendations.

## Legacy or competing behavior to keep contained

- `morning_nudge_v2` must remain secondary; action morning messages now come
  from dated occurrences.
- `momentum_outreach` must not send messages independently while action morning,
  evening review, Saturday planning, weekly review and winback are active.
- Old weekly/daily bilan signals should not be primary inputs for momentum.

## New base

- `supabase/functions/_shared/momentum_v2.ts`
  - builds `MomentumSnapshotV2` from:
    - `user_habit_week_occurrences`
    - `user_plan_item_entries`
    - `user_habit_week_plans`
    - `scheduled_checkins`
    - `chat_messages`
    - latest `conversation_pulse`
  - persists snapshots into `system_runtime_snapshots` with
    `snapshot_type = "momentum_state_v2"`.
  - exposes `selectMomentumIntervention(snapshot)` without sending anything.

## Runtime wiring now active

- After WhatsApp evening action review responses, a fresh `momentum_state_v2`
  snapshot is calculated and persisted.
- During `weekly_progress_review_v2`, a fresh snapshot is calculated, persisted,
  and injected into the dynamic grounding when the WhatsApp 24h window is open.

## Still intentionally disabled

- No new proactive momentum outreach.
- No new momentum cron.
- No replacement of winback.
- No direct WhatsApp send from the momentum module.

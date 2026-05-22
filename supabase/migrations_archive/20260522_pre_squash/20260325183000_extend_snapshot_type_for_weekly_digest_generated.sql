-- Extend system_runtime_snapshots.snapshot_type CHECK constraint
-- to accept the runtime event 'weekly_digest_generated_v2'.
--
-- Additive: preserves all existing snapshot and event values, including
-- 'weekly_digest' and 'cooldown_entry'.

alter table public.system_runtime_snapshots
  drop constraint if exists system_runtime_snapshots_snapshot_type_check;

alter table public.system_runtime_snapshots
  add constraint system_runtime_snapshots_snapshot_type_check
    check (
      snapshot_type in (
        -- Original 5 snapshot types
        'conversation_pulse',
        'momentum_state_v2',
        'active_load',
        'repair_mode',
        'weekly_digest',

        -- 6.2 Lifecycle / onboarding / cycle
        'cycle_created_v2',
        'cycle_structured_v2',
        'cycle_prioritized_v2',
        'cycle_profile_completed_v2',
        'transformation_activated_v2',
        'transformation_completed_v2',
        'transformation_handoff_generated_v2',
        'plan_generated_v2',
        'plan_activated_v2',

        -- 6.3 Runtime
        'conversation_pulse_generated_v2',
        'weekly_digest_generated_v2',
        'momentum_state_updated_v2',
        'active_load_recomputed_v2',
        'daily_bilan_decided_v2',
        'daily_bilan_completed_v2',
        'weekly_bilan_decided_v2',
        'weekly_bilan_completed_v2',
        'proactive_window_decided_v2',
        'morning_nudge_generated_v2',
        'rendez_vous_state_changed_v2',
        'repair_mode_entered_v2',
        'repair_mode_exited_v2',
        'plan_item_entry_logged_v2',
        'metric_recorded_v2',

        -- 6.4 Memory
        'memory_retrieval_executed_v2',
        'memory_persisted_v2',
        'memory_handoff_v2',

        -- 6.5 Coaching
        'coaching_blocker_detected_v2',
        'coaching_intervention_proposed_v2',
        'coaching_intervention_rendered_v2',
        'coaching_follow_up_captured_v2',
        'coaching_technique_deprioritized_v2',

        -- Phase A: Cooldown engine
        'cooldown_entry'
      )
    );

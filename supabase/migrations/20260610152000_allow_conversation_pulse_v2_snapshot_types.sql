ALTER TABLE ONLY "public"."system_runtime_snapshots"
  DROP CONSTRAINT IF EXISTS "system_runtime_snapshots_snapshot_type_check";

ALTER TABLE ONLY "public"."system_runtime_snapshots"
  ADD CONSTRAINT "system_runtime_snapshots_snapshot_type_check"
  CHECK (
    "snapshot_type" = ANY (
      ARRAY[
        'conversation_pulse'::text,
        'watcher_conversation_pulse_v2'::text,
        'daily_conversation_pulse_v2'::text,
        'weekly_conversation_pulse_v2'::text,
        'momentum_state_v2'::text,
        'active_load'::text,
        'repair_mode'::text,
        'weekly_digest'::text,
        'cycle_created_v2'::text,
        'cycle_structured_v2'::text,
        'cycle_prioritized_v2'::text,
        'cycle_profile_completed_v2'::text,
        'transformation_activated_v2'::text,
        'transformation_completed_v2'::text,
        'transformation_handoff_generated_v2'::text,
        'plan_generated_v2'::text,
        'plan_activated_v2'::text,
        'conversation_pulse_generated_v2'::text,
        'weekly_digest_generated_v2'::text,
        'momentum_state_updated_v2'::text,
        'active_load_recomputed_v2'::text,
        'daily_bilan_decided_v2'::text,
        'daily_bilan_completed_v2'::text,
        'weekly_bilan_decided_v2'::text,
        'weekly_bilan_completed_v2'::text,
        'proactive_window_decided_v2'::text,
        'morning_nudge_generated_v2'::text,
        'rendez_vous_state_changed_v2'::text,
        'repair_mode_entered_v2'::text,
        'repair_mode_exited_v2'::text,
        'plan_item_entry_logged_v2'::text,
        'metric_recorded_v2'::text,
        'memory_retrieval_executed_v2'::text,
        'memory_persisted_v2'::text,
        'memory_handoff_v2'::text,
        'coaching_blocker_detected_v2'::text,
        'coaching_intervention_proposed_v2'::text,
        'coaching_intervention_rendered_v2'::text,
        'coaching_follow_up_captured_v2'::text,
        'coaching_technique_deprioritized_v2'::text,
        'cooldown_entry'::text
      ]
    )
  );

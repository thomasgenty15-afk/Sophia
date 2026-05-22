do $$
begin
  begin
    alter table public.whatsapp_pending_actions
      drop constraint if exists whatsapp_pending_actions_kind_check;
  exception when undefined_table then
    null;
  end;

  begin
    alter table public.whatsapp_pending_actions
      add constraint whatsapp_pending_actions_kind_check
      check (
        kind in (
          'scheduled_checkin',
          'memory_echo',
          'deferred_send',
          'bilan_reschedule',
          'weekly_bilan',
          'proactive_template_candidate',
          'access_ended_notification',
          'access_reactivation_offer',
          'rendez_vous'
        )
      );
  exception when duplicate_object then
    null;
  end;
end $$;

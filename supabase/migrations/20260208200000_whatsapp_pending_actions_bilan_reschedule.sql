-- Allow bilan reschedule pending actions.
-- Adds 'bilan_reschedule' to whatsapp_pending_actions kind check constraint.

do $$
begin
  -- Drop existing kind check constraint.
  begin
    alter table public.whatsapp_pending_actions drop constraint if exists whatsapp_pending_actions_kind_check;
  exception when undefined_table then
    null;
  end;

  -- Re-add with expanded list (idempotent-ish).
  begin
    alter table public.whatsapp_pending_actions
      add constraint whatsapp_pending_actions_kind_check
      check (kind in ('scheduled_checkin', 'memory_echo', 'deferred_send', 'bilan_reschedule'));
  exception when duplicate_object then
    null;
  end;
end $$;


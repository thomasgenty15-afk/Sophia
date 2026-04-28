-- Remove legacy WhatsApp proactive conversation flows.
--
-- Kept:
-- - process-checkins as the generic scheduled_checkins delivery bus
-- - trigger-watcher-batch / memorizer / winback support code
--
-- Removed:
-- - trigger-proactive-scheduler fan-out
-- - daily_bilan proactive dispatch
-- - weekly_bilan proactive dispatch
-- - memory_echo proactive dispatch

create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  jid int;
begin
  for jid in
    select jobid
    from cron.job
    where jobname in (
      'trigger-proactive-scheduler',
      'trigger-daily-bilan',
      'trigger-weekly-bilan',
      'trigger-memory-echo'
    )
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

drop function if exists public.claim_due_daily_bilan(int, time);
drop function if exists public.claim_due_weekly_bilan(int, time);
drop function if exists public.claim_due_memory_echo(int, time, int);

delete from public.whatsapp_pending_actions
where kind in ('daily_bilan', 'weekly_bilan', 'memory_echo', 'bilan_reschedule')
   or (
    kind = 'proactive_template_candidate'
    and (
      (payload ->> 'purpose') in ('daily_bilan', 'weekly_bilan', 'memory_echo')
      or (payload ->> 'follow_up_kind') in ('daily_bilan', 'weekly_bilan', 'memory_echo')
    )
  );

update public.scheduled_checkins
set
  status = 'cancelled',
  processed_at = now()
where event_context in ('daily_bilan_reschedule', 'daily_bilan_v2', 'weekly_bilan_v2')
  and status in ('pending', 'retrying', 'awaiting_user');

do $$
begin
  begin
    alter table public.whatsapp_pending_actions
      drop constraint if exists whatsapp_pending_actions_kind_check;
  exception when undefined_table then
    return;
  end;

  alter table public.whatsapp_pending_actions
    add constraint whatsapp_pending_actions_kind_check
    check (
      kind in (
        'scheduled_checkin',
        'deferred_send',
        'proactive_template_candidate',
        'access_ended_notification',
        'access_reactivation_offer',
        'rendez_vous'
      )
    );
end $$;

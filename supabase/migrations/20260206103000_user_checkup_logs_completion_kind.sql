-- Add completion kind to distinguish fully completed vs user-aborted (partial) checkups.
-- Partial checkups should not count as "checkup done today" (so they don't block a restart later).

alter table public.user_checkup_logs
  add column if not exists completion_kind text not null default 'full';

do $$
begin
  execute $c$
    alter table public.user_checkup_logs
      add constraint user_checkup_logs_completion_kind_check
      check (completion_kind in ('full', 'partial'))
  $c$;
exception when duplicate_object then null;
end $$;

-- Speed up "was checkup done today?" lookups (we only care about full checkups).
create index if not exists idx_user_checkup_logs_user_completed_full
  on public.user_checkup_logs (user_id, completed_at desc)
  where completion_kind = 'full';



-- Add billing interval to subscriptions so the frontend can distinguish monthly vs yearly.
alter table public.subscriptions
  add column if not exists interval text;

do $$
begin
  execute 'alter table public.subscriptions drop constraint if exists subscriptions_interval_check';
  execute $sql$
    alter table public.subscriptions
      add constraint subscriptions_interval_check
      check (interval is null or interval in ('monthly','yearly'))
  $sql$;
end $$;




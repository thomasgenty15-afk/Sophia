alter table public.user_plan_level_reviews
  add column if not exists review_mode text not null default 'user_review',
  add column if not exists auto_reason text null;

alter table public.user_plan_level_reviews
  drop constraint if exists user_plan_level_reviews_review_mode_check;

alter table public.user_plan_level_reviews
  add constraint user_plan_level_reviews_review_mode_check
  check (review_mode in ('user_review', 'auto_timeout'));

create index if not exists user_plan_level_reviews_plan_phase_idx
  on public.user_plan_level_reviews(plan_id, phase_id, created_at desc);

create index if not exists user_plan_level_generation_events_plan_phase_idx
  on public.user_plan_level_generation_events(plan_id, from_phase_id, created_at desc);

alter table public.scheduled_checkins
  drop constraint if exists scheduled_checkins_origin_check;

alter table public.scheduled_checkins
  add constraint scheduled_checkins_origin_check
  check (
    origin in (
      'watcher',
      'rendez_vous',
      'action_morning',
      'action_review',
      'action_followup',
      'weekly_planning',
      'weekly_review',
      'level_review',
      'unknown'
    )
  );

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'trigger-level-review-transitions-v1'
  limit 1;

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'trigger-level-review-transitions-v1',
  '15 0 * * *',
  $$
  with cfg as (
    select
      coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), 'https://ybyqxwnwjvuxckolsddn.supabase.co') as base_url,
      coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
      coalesce((select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/trigger-level-review-transitions-v1',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select anon_key from cfg),
        'authorization', 'Bearer ' || (select anon_key from cfg),
        'x-internal-secret', (select internal_secret from cfg)
      ),
      body := '{}'::jsonb
    ) as request_id
  from cfg
  where (select anon_key from cfg) <> '' and (select internal_secret from cfg) <> '';
  $$
);

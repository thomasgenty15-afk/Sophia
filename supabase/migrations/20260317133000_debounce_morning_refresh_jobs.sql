create extension if not exists "pg_cron" with schema "extensions";

create table if not exists public.user_scheduling_refresh_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null
    check (job_type in ('morning_active_actions_refresh')),
  requested_at timestamptz not null default now(),
  run_after timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_type)
);

create index if not exists user_scheduling_refresh_jobs_run_after_idx
  on public.user_scheduling_refresh_jobs (run_after asc, updated_at asc);

create or replace function public.enqueue_user_scheduling_refresh_job(
  p_user_id uuid,
  p_job_type text,
  p_delay interval default interval '50 minutes'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_delay interval := coalesce(p_delay, interval '50 minutes');
begin
  if p_user_id is null then
    return;
  end if;

  if p_job_type not in ('morning_active_actions_refresh') then
    raise exception 'Unsupported scheduling refresh job type: %', p_job_type;
  end if;

  insert into public.user_scheduling_refresh_jobs (
    user_id,
    job_type,
    requested_at,
    run_after,
    updated_at
  )
  values (
    p_user_id,
    p_job_type,
    now(),
    now() + effective_delay,
    now()
  )
  on conflict (user_id, job_type) do update
  set
    requested_at = excluded.requested_at,
    run_after = excluded.run_after,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.process_user_scheduling_refresh_jobs(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_limit integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  processed_count integer := 0;
  failed_count integer := 0;
  job record;
begin
  for job in
    with due as (
      select q.user_id, q.job_type
      from public.user_scheduling_refresh_jobs q
      where q.run_after <= now()
      order by q.run_after asc, q.updated_at asc
      limit effective_limit
      for update skip locked
    ),
    claimed as (
      delete from public.user_scheduling_refresh_jobs q
      using due
      where q.user_id = due.user_id
        and q.job_type = due.job_type
      returning q.user_id, q.job_type
    )
    select claimed.user_id, claimed.job_type
    from claimed
  loop
    begin
      if job.job_type = 'morning_active_actions_refresh' then
        perform public.request_morning_active_action_checkins_refresh(job.user_id);
      else
        raise warning
          '[process_user_scheduling_refresh_jobs] ignored unknown job_type=% user_id=%',
          job.job_type,
          job.user_id;
      end if;

      processed_count := processed_count + 1;
    exception when others then
      failed_count := failed_count + 1;
      raise warning
        '[process_user_scheduling_refresh_jobs] failed job_type=% user_id=% err=%',
        job.job_type,
        job.user_id,
        sqlerrm;
      perform public.enqueue_user_scheduling_refresh_job(
        job.user_id,
        job.job_type,
        interval '50 minutes'
      );
    end;
  end loop;

  return jsonb_build_object(
    'processed', processed_count,
    'failed', failed_count
  );
end;
$$;

create or replace function public.handle_morning_active_action_checkins_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  should_refresh boolean := false;
  old_active boolean := false;
  new_active boolean := false;
begin
  if tg_op = 'DELETE' then
    target_user_id := old.user_id;
  else
    target_user_id := new.user_id;
  end if;

  if tg_table_name in ('user_actions', 'user_personal_actions', 'user_framework_tracking', 'user_vital_signs') then
    if tg_table_name = 'user_vital_signs' then
      old_active := tg_op <> 'INSERT' and coalesce(old.status, '') in ('active', 'monitoring');
      new_active := tg_op <> 'DELETE' and coalesce(new.status, '') in ('active', 'monitoring');
    else
      old_active := tg_op <> 'INSERT' and coalesce(old.status, '') = 'active';
      new_active := tg_op <> 'DELETE' and coalesce(new.status, '') = 'active';
    end if;

    if tg_op = 'INSERT' then
      should_refresh := new_active;
    elsif tg_op = 'DELETE' then
      should_refresh := old_active;
    else
      should_refresh := old_active <> new_active;

      if tg_table_name = 'user_framework_tracking' then
        should_refresh := should_refresh
          or (
            (old_active or new_active)
            and (
              coalesce(old.title, '') is distinct from coalesce(new.title, '')
              or coalesce(old.plan_id::text, '') is distinct from coalesce(new.plan_id::text, '')
            )
          );
      elsif tg_table_name = 'user_vital_signs' then
        should_refresh := should_refresh
          or (
            (old_active or new_active)
            and (
              coalesce(old.label, '') is distinct from coalesce(new.label, '')
              or coalesce(old.current_value, '') is distinct from coalesce(new.current_value, '')
              or coalesce(old.target_value, '') is distinct from coalesce(new.target_value, '')
              or coalesce(old.unit, '') is distinct from coalesce(new.unit, '')
              or coalesce(old.time_of_day, '') is distinct from coalesce(new.time_of_day, '')
              or coalesce(old.plan_id::text, '') is distinct from coalesce(new.plan_id::text, '')
            )
          );
      else
        should_refresh := should_refresh
          or (
            (old_active or new_active)
            and (
              coalesce(old.title, '') is distinct from coalesce(new.title, '')
              or coalesce(old.description, '') is distinct from coalesce(new.description, '')
              or coalesce(old.time_of_day, '') is distinct from coalesce(new.time_of_day, '')
              or coalesce(old.target_reps, 0) is distinct from coalesce(new.target_reps, 0)
              or coalesce(array_to_string(old.scheduled_days, ','), '') is distinct from coalesce(array_to_string(new.scheduled_days, ','), '')
            )
          );
        if tg_table_name = 'user_actions' then
          should_refresh := should_refresh
            or (
              (old_active or new_active)
              and coalesce(old.plan_id::text, '') is distinct from coalesce(new.plan_id::text, '')
            );
        elsif tg_table_name = 'user_personal_actions' then
          should_refresh := should_refresh
            or (
              (old_active or new_active)
              and (
                coalesce(old.quest_type, '') is distinct from coalesce(new.quest_type, '')
                or coalesce(old.rationale, '') is distinct from coalesce(new.rationale, '')
                or coalesce(old.tips, '') is distinct from coalesce(new.tips, '')
              )
            );
        end if;
      end if;
    end if;
  elsif tg_table_name = 'user_plans' then
    if tg_op = 'INSERT' then
      should_refresh := coalesce(new.status, '') in ('active', 'in_progress', 'pending');
    elsif tg_op = 'UPDATE' then
      should_refresh :=
        coalesce(new.status, '') in ('active', 'in_progress', 'pending')
        and (
          coalesce(old.deep_why, '') is distinct from coalesce(new.deep_why, '')
          or coalesce(old.inputs_why, '') is distinct from coalesce(new.inputs_why, '')
          or coalesce(old.inputs_blockers, '') is distinct from coalesce(new.inputs_blockers, '')
          or coalesce(old.inputs_low_motivation_message, '') is distinct from coalesce(new.inputs_low_motivation_message, '')
        );
    end if;
  end if;

  if should_refresh then
    perform public.enqueue_user_scheduling_refresh_job(
      target_user_id,
      'morning_active_actions_refresh',
      interval '50 minutes'
    );
  end if;

  return null;
end;
$$;

do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'process-user-scheduling-refresh-jobs'
  limit 1;

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'process-user-scheduling-refresh-jobs',
  '0 * * * *',
  $$select public.process_user_scheduling_refresh_jobs(200);$$
);

-- Add a WhatsApp brain watchdog path on top of the existing LLM retry queue.
-- Service-role callers may enqueue jobs, and callers can request a custom
-- first-attempt delay through metadata.delay_seconds.

create or replace function public.enqueue_llm_retry_job(
  p_user_id uuid,
  p_scope text,
  p_channel text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_scope text;
  v_channel text;
  v_message text;
  v_hash text;
  v_delay_seconds integer;
  v_delay interval;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Unauthorized';
    end if;
    if auth.uid() <> p_user_id then
      raise exception 'Forbidden';
    end if;
  end if;

  v_scope := coalesce(nullif(trim(p_scope), ''), 'web');
  v_channel := coalesce(nullif(trim(p_channel), ''), 'web');
  v_message := coalesce(nullif(trim(p_message), ''), '');
  if v_message = '' then
    raise exception 'Message is empty';
  end if;

  v_delay_seconds := case
    when coalesce(p_metadata->>'delay_seconds', '') ~ '^[0-9]+$'
      then greatest(0, least((p_metadata->>'delay_seconds')::integer, 3600))
    else 120
  end;
  v_delay := make_interval(secs => v_delay_seconds);
  v_hash := md5(v_message);

  insert into public.llm_retry_jobs (
    user_id, scope, channel, message, message_hash, next_attempt_at, metadata
  )
  values (
    p_user_id,
    v_scope,
    v_channel,
    v_message,
    v_hash,
    now() + v_delay + ((random() * 40.0 - 20.0) * interval '1 second'),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, scope, message_hash)
    where status = any (array['pending'::text, 'processing'::text])
  do update
    set
      updated_at = now(),
      next_attempt_at = greatest(
        public.llm_retry_jobs.next_attempt_at,
        now() + v_delay + ((random() * 40.0 - 20.0) * interval '1 second')
      ),
      metadata = public.llm_retry_jobs.metadata || excluded.metadata
  returning id into v_id;

  return v_id;
end;
$$;

do $$
declare
  v_jobid bigint;
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    return;
  end if;
  begin
    -- cron.job is only writable by supabase_admin; go through cron.alter_job
    -- (SECURITY DEFINER, allowed for the job owner) instead of a direct UPDATE.
    select jobid into v_jobid
    from cron.job
    where jobname = 'process-llm-retry-jobs'
    limit 1;
    if v_jobid is not null then
      perform cron.alter_job(job_id => v_jobid, schedule => '* * * * *');
    end if;
  exception when insufficient_privilege then
    raise notice 'skipping process-llm-retry-jobs reschedule: insufficient privilege on cron catalog';
  end;
end $$;

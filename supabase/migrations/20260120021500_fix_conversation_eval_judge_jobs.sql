-- Fix: make judge job enqueue truly idempotent and compatible with Postgres ON CONFLICT.
-- We keep exactly ONE job row per eval_run_id (simpler + robust), since a run should be judged once.

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where
      n.nspname = 'public'
      and t.relname = 'conversation_eval_judge_jobs'
      and c.conname = 'conversation_eval_judge_jobs_eval_run_id_uniq'
  ) then
    alter table public.conversation_eval_judge_jobs
      add constraint conversation_eval_judge_jobs_eval_run_id_uniq unique (eval_run_id);
  end if;
end $$;

-- Drop the partial unique index (no longer needed and cannot be targeted by ON CONFLICT ON CONSTRAINT).
drop index if exists public.conversation_eval_judge_jobs_dedupe_pending;

create or replace function public.enqueue_conversation_eval_judge_job(
  p_eval_run_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_eval_run_id is null then
    raise exception 'eval_run_id is required';
  end if;

  insert into public.conversation_eval_judge_jobs (
    eval_run_id, next_attempt_at, metadata
  )
  values (
    p_eval_run_id,
    now(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (eval_run_id) do update
    set
      -- Reset failed/processing jobs back to pending so the worker can retry.
      status = 'pending',
      attempt_count = public.conversation_eval_judge_jobs.attempt_count,
      next_attempt_at = least(public.conversation_eval_judge_jobs.next_attempt_at, now()),
      updated_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = null,
      metadata = public.conversation_eval_judge_jobs.metadata || excluded.metadata
  returning id into v_id;

  return v_id;
end;
$$;



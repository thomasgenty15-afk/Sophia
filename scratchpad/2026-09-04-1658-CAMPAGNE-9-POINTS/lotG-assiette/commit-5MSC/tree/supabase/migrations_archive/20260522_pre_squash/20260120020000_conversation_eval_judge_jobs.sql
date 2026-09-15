-- Async qualitative judge job queue for conversation eval runs.
-- Goal: decouple expensive LLM judge (eval-judge with force_real_ai=true) from run-evals wall-clock limits.

create table if not exists public.conversation_eval_judge_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  eval_run_id uuid not null references public.conversation_eval_runs(id) on delete cascade,

  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 30,

  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  completed_at timestamptz,

  locked_at timestamptz,
  locked_by text,

  last_error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists conversation_eval_judge_jobs_next_attempt_idx
  on public.conversation_eval_judge_jobs (next_attempt_at)
  where status in ('pending','processing');

-- Avoid duplicate judge jobs for the same eval_run while one is pending/processing.
create unique index if not exists conversation_eval_judge_jobs_dedupe_pending
  on public.conversation_eval_judge_jobs (eval_run_id)
  where status in ('pending','processing');

alter table public.conversation_eval_judge_jobs enable row level security;

-- No user-facing policies. Jobs are claimed by service_role (worker function).

-- Enqueue helper (used by run-evals with service_role).
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
  on conflict on constraint conversation_eval_judge_jobs_dedupe_pending do update
    set
      updated_at = now(),
      next_attempt_at = least(public.conversation_eval_judge_jobs.next_attempt_at, now()),
      metadata = public.conversation_eval_judge_jobs.metadata || excluded.metadata
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.enqueue_conversation_eval_judge_job(uuid, jsonb) to service_role;

-- Claim jobs with SKIP LOCKED semantics (so multiple workers can run safely).
create or replace function public.claim_conversation_eval_judge_jobs(
  p_limit integer default 10,
  p_worker_id text default 'worker'
)
returns setof public.conversation_eval_judge_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with cte as (
    select id
    from public.conversation_eval_judge_jobs
    where
      status = 'pending'
      and attempt_count < max_attempts
      and next_attempt_at <= now()
    order by next_attempt_at asc
    limit greatest(1, least(coalesce(p_limit, 10), 100))
    for update skip locked
  )
  update public.conversation_eval_judge_jobs j
  set
    status = 'processing',
    locked_at = now(),
    locked_by = coalesce(nullif(trim(p_worker_id), ''), 'worker'),
    updated_at = now()
  where j.id in (select id from cte)
  returning j.*;
end;
$$;

grant execute on function public.claim_conversation_eval_judge_jobs(integer, text) to service_role;



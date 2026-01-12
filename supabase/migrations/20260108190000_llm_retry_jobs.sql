-- LLM retry queue: when all Gemini models fail, we return a template and schedule an automatic retry (~2 min later).
-- This supports the product rule: never answer "on the substance" without an IA response.

create table if not exists public.llm_retry_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'web',
  channel text not null default 'web',

  message text not null,
  message_hash text not null,

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

create index if not exists llm_retry_jobs_next_attempt_idx
  on public.llm_retry_jobs (next_attempt_at)
  where status in ('pending','processing');

create index if not exists llm_retry_jobs_user_scope_idx
  on public.llm_retry_jobs (user_id, scope, created_at desc);

-- Avoid duplicate jobs for the same message while one is already pending/processing.
create unique index if not exists llm_retry_jobs_dedupe_pending
  on public.llm_retry_jobs (user_id, scope, message_hash)
  where status in ('pending','processing');

alter table public.llm_retry_jobs enable row level security;

-- No direct SELECT policies: users shouldn't read the internal job queue.
-- Inserts happen only via SECURITY DEFINER RPC that validates auth.uid().

create or replace function public.enqueue_llm_retry_job(
  p_user_id uuid,
  p_scope text,
  p_channel text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_scope text;
  v_channel text;
  v_message text;
  v_hash text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if auth.uid() <> p_user_id then
    raise exception 'Forbidden';
  end if;

  v_scope := coalesce(nullif(trim(p_scope), ''), 'web');
  v_channel := coalesce(nullif(trim(p_channel), ''), 'web');
  v_message := coalesce(nullif(trim(p_message), ''), '');
  if v_message = '' then
    raise exception 'Message is empty';
  end if;

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
    now() + interval '2 minutes' + ((random() * 40.0 - 20.0) * interval '1 second'),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict on constraint llm_retry_jobs_dedupe_pending do update
    set
      updated_at = now(),
      -- move next attempt forward (keep jitter) in case we re-hit failure quickly
      next_attempt_at = greatest(public.llm_retry_jobs.next_attempt_at, now() + interval '2 minutes' + ((random() * 40.0 - 20.0) * interval '1 second')),
      metadata = public.llm_retry_jobs.metadata || excluded.metadata
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.enqueue_llm_retry_job(uuid, text, text, text, jsonb) to authenticated;

-- Claim jobs with SKIP LOCKED semantics (so multiple workers can run safely).
create or replace function public.claim_llm_retry_jobs(
  p_limit integer default 20,
  p_worker_id text default 'worker'
)
returns setof public.llm_retry_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with cte as (
    select id
    from public.llm_retry_jobs
    where
      status = 'pending'
      and attempt_count < max_attempts
      and next_attempt_at <= now()
    order by next_attempt_at asc
    limit greatest(1, least(coalesce(p_limit, 20), 200))
    for update skip locked
  )
  update public.llm_retry_jobs j
  set
    status = 'processing',
    locked_at = now(),
    locked_by = coalesce(nullif(trim(p_worker_id), ''), 'worker'),
    updated_at = now()
  where j.id in (select id from cte)
  returning j.*;
end;
$$;

grant execute on function public.claim_llm_retry_jobs(integer, text) to service_role;




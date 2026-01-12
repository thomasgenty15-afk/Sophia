-- System error logs (Edge Functions / backend). Goal: capture crashes/timeouts/exceptions in DB
-- so the Admin "Production log" can show them even when the function fails before writing domain rows.

create table if not exists public.system_error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  severity text not null default 'error' check (severity in ('info','warn','error')),
  source text not null default 'edge',
  function_name text not null,
  title text,
  message text not null,
  stack text,
  request_id text,
  user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists system_error_logs_created_at_idx
  on public.system_error_logs (created_at desc);
create index if not exists system_error_logs_function_name_idx
  on public.system_error_logs (function_name, created_at desc);
create index if not exists system_error_logs_request_id_idx
  on public.system_error_logs (request_id);
create index if not exists system_error_logs_user_id_idx
  on public.system_error_logs (user_id, created_at desc);
create index if not exists system_error_logs_severity_idx
  on public.system_error_logs (severity, created_at desc);

alter table public.system_error_logs enable row level security;

-- Keep table locked down: only internal admins can read; inserts are done by service role (bypasses RLS).
drop policy if exists "system_error_logs_internal_admin_read" on public.system_error_logs;
create policy "system_error_logs_internal_admin_read"
  on public.system_error_logs
  for select
  using (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()));




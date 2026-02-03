-- Track when users complete their daily checkup (bilan).
-- Used to prevent duplicate checkups in the same day and for analytics.

create table if not exists public.user_checkup_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  scope text not null default 'global',
  completed_at timestamptz not null default now(),
  items_count int not null default 0,
  completed_count int not null default 0,
  missed_count int not null default 0,
  source text not null default 'chat', -- 'chat' | 'cron' | 'manual'
  created_at timestamptz not null default now()
);

-- Index for quick lookup: "was checkup done today for this user?"
create index if not exists idx_user_checkup_logs_user_completed 
  on public.user_checkup_logs (user_id, completed_at desc);

-- RLS
alter table public.user_checkup_logs enable row level security;

-- Users can read their own checkup logs
do $$
begin
  execute 'create policy rls_user_checkup_logs_select_self on public.user_checkup_logs for select using (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;

-- Users can insert their own checkup logs (via edge functions)
do $$
begin
  execute 'create policy rls_user_checkup_logs_insert_self on public.user_checkup_logs for insert with check (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;




create table if not exists public.confirmation_tokens_consumed (
  token_id uuid primary key,
  consumed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.confirmation_tokens_consumed enable row level security;

create policy "service role manages confirmation token consumption"
on public.confirmation_tokens_consumed
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

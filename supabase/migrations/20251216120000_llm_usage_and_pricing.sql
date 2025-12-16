-- LLM usage logging + pricing (admin-only).

create table if not exists public.llm_pricing (
  provider text not null,
  model text not null,
  input_per_1k_tokens_usd numeric not null default 0,
  output_per_1k_tokens_usd numeric not null default 0,
  currency text not null default 'USD',
  updated_at timestamptz not null default now(),
  primary key (provider, model)
);

create table if not exists public.llm_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id text,
  source text, -- e.g. "sophia-brain:dispatcher", "eval-judge", "simulate-user", etc.
  provider text not null default 'gemini',
  model text not null,
  kind text not null check (kind in ('generate','embed')),
  prompt_tokens integer,
  output_tokens integer,
  total_tokens integer,
  cost_usd numeric,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists llm_usage_events_request_id_idx on public.llm_usage_events (request_id);
create index if not exists llm_usage_events_created_at_idx on public.llm_usage_events (created_at);

alter table public.llm_pricing enable row level security;
alter table public.llm_usage_events enable row level security;

drop policy if exists "llm_pricing_internal_admin_all" on public.llm_pricing;
create policy "llm_pricing_internal_admin_all"
on public.llm_pricing
for all
using (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()))
with check (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()));

drop policy if exists "llm_usage_events_internal_admin_all" on public.llm_usage_events;
create policy "llm_usage_events_internal_admin_all"
on public.llm_usage_events
for all
using (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()))
with check (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()));

-- Seed default pricing rows (0 by default; you can update with real prices).
insert into public.llm_pricing (provider, model, input_per_1k_tokens_usd, output_per_1k_tokens_usd)
values
  ('gemini', 'gemini-2.0-flash', 0, 0),
  ('gemini', 'text-embedding-004', 0, 0)
on conflict (provider, model) do nothing;



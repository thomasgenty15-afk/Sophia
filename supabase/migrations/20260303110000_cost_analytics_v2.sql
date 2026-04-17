-- Cost analytics V2: normalized LLM usage dimensions, pricing metadata,
-- WhatsApp template billing ledger, and admin analytics RPCs.

-- 1) Extend pricing table with lightweight versioning metadata.
alter table public.llm_pricing
  add column if not exists pricing_version text not null default 'v1',
  add column if not exists effective_at timestamptz not null default now(),
  add column if not exists is_active boolean not null default true;

-- 2) Extend LLM usage events with normalized dimensions and pricing snapshots.
alter table public.llm_usage_events
  add column if not exists operation_family text not null default 'other',
  add column if not exists operation_name text,
  add column if not exists channel text not null default 'system',
  add column if not exists status text not null default 'success',
  add column if not exists latency_ms integer,
  add column if not exists provider_request_id text,
  add column if not exists pricing_version text,
  add column if not exists input_price_per_1k_tokens_usd numeric,
  add column if not exists output_price_per_1k_tokens_usd numeric,
  add column if not exists cost_unpriced boolean not null default false,
  add column if not exists currency text not null default 'USD',
  add column if not exists step_index integer;

create index if not exists llm_usage_events_created_at_user_idx
  on public.llm_usage_events (created_at, user_id);
create index if not exists llm_usage_events_operation_idx
  on public.llm_usage_events (operation_family, operation_name);
create index if not exists llm_usage_events_model_provider_idx
  on public.llm_usage_events (model, provider);
create index if not exists llm_usage_events_status_idx
  on public.llm_usage_events (status);

-- 3) WhatsApp template cost ledger (billable only on "sent").
create table if not exists public.whatsapp_cost_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_date date not null,
  user_id uuid null references public.profiles(id) on delete set null,
  outbound_message_id uuid null references public.whatsapp_outbound_messages(id) on delete set null,
  provider_message_id text not null,
  purpose text,
  template_name text,
  template_language text,
  unit_cost_eur numeric not null default 0.0712,
  final_cost_eur numeric not null default 0.0712,
  currency text not null default 'EUR',
  billable boolean not null default true,
  billing_status text not null default 'sent',
  billed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists whatsapp_cost_events_provider_message_id_key
  on public.whatsapp_cost_events (provider_message_id);
create index if not exists whatsapp_cost_events_event_date_idx
  on public.whatsapp_cost_events (event_date);
create index if not exists whatsapp_cost_events_user_id_idx
  on public.whatsapp_cost_events (user_id);

alter table public.whatsapp_cost_events enable row level security;

drop policy if exists "whatsapp_cost_events_internal_admin_all" on public.whatsapp_cost_events;
create policy "whatsapp_cost_events_internal_admin_all"
on public.whatsapp_cost_events
for all
using (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()))
with check (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()));

-- 4) Helper for day/week/month bucketing.
create or replace function public.cost_bucket(ts timestamptz, bucket text)
returns timestamptz
language sql
immutable
as $$
  select case lower(coalesce(bucket, 'day'))
    when 'month' then date_trunc('month', ts)
    when 'week' then date_trunc('week', ts)
    else date_trunc('day', ts)
  end
$$;

-- 5) Canonical cost facts union (AI + WhatsApp template cost).
create or replace view public.cost_fact_events as
  select
    ue.created_at,
    ue.user_id,
    coalesce(ue.operation_family, 'other') as operation_family,
    coalesce(ue.operation_name, ue.source, 'unknown') as operation_name,
    ue.source,
    ue.provider,
    ue.model,
    ue.kind,
    coalesce(ue.total_tokens, 0) as total_tokens,
    coalesce(ue.cost_usd, 0)::numeric as cost_usd,
    0::numeric as cost_eur,
    'ai'::text as cost_domain
  from public.llm_usage_events ue
  union all
  select
    wce.billed_at as created_at,
    wce.user_id,
    'whatsapp_template'::text as operation_family,
    coalesce(wce.purpose, 'template_send') as operation_name,
    'whatsapp-template'::text as source,
    'meta'::text as provider,
    coalesce(wce.template_name, 'template') as model,
    'template'::text as kind,
    0::integer as total_tokens,
    0::numeric as cost_usd,
    coalesce(wce.final_cost_eur, 0)::numeric as cost_eur,
    'whatsapp'::text as cost_domain
  from public.whatsapp_cost_events wce
  where wce.billable = true and lower(wce.billing_status) = 'sent';

-- 6) Admin analytics RPCs.
drop function if exists public.get_admin_cost_overview(timestamptz, timestamptz, text, numeric);
create or replace function public.get_admin_cost_overview(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text default 'day',
  p_whatsapp_eur_to_usd numeric default 1.08
)
returns table (
  bucket_start timestamptz,
  total_cost_usd numeric,
  ai_cost_usd numeric,
  whatsapp_cost_eur numeric,
  whatsapp_cost_usd numeric,
  total_calls bigint,
  total_tokens bigint,
  unique_users bigint
)
language sql
security definer
set search_path = public
as $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select *
    from public.cost_fact_events c, admin_guard
    where c.created_at >= p_start and c.created_at < p_end
  )
  select
    public.cost_bucket(b.created_at, p_bucket) as bucket_start,
    (sum(b.cost_usd) + sum(b.cost_eur) * p_whatsapp_eur_to_usd)::numeric as total_cost_usd,
    sum(b.cost_usd)::numeric as ai_cost_usd,
    sum(b.cost_eur)::numeric as whatsapp_cost_eur,
    (sum(b.cost_eur) * p_whatsapp_eur_to_usd)::numeric as whatsapp_cost_usd,
    count(*)::bigint as total_calls,
    sum(b.total_tokens)::bigint as total_tokens,
    count(distinct b.user_id)::bigint as unique_users
  from base b
  group by 1
  order by 1 desc;
$$;

grant execute on function public.get_admin_cost_overview(timestamptz, timestamptz, text, numeric) to authenticated, service_role;

drop function if exists public.get_admin_cost_by_user(timestamptz, timestamptz, text, numeric);
create or replace function public.get_admin_cost_by_user(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text default 'day',
  p_whatsapp_eur_to_usd numeric default 1.08
)
returns table (
  bucket_start timestamptz,
  user_id uuid,
  full_name text,
  email text,
  ai_cost_usd numeric,
  whatsapp_cost_eur numeric,
  total_cost_usd numeric,
  total_calls bigint,
  total_tokens bigint
)
language sql
security definer
set search_path = public
as $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select *
    from public.cost_fact_events c, admin_guard
    where c.created_at >= p_start and c.created_at < p_end
      and c.user_id is not null
  )
  select
    public.cost_bucket(b.created_at, p_bucket) as bucket_start,
    b.user_id,
    coalesce(p.full_name, 'Unknown') as full_name,
    coalesce(p.email, '') as email,
    sum(b.cost_usd)::numeric as ai_cost_usd,
    sum(b.cost_eur)::numeric as whatsapp_cost_eur,
    (sum(b.cost_usd) + sum(b.cost_eur) * p_whatsapp_eur_to_usd)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    sum(b.total_tokens)::bigint as total_tokens
  from base b
  left join public.profiles p on p.id = b.user_id
  group by 1, 2, 3, 4
  order by 1 desc, total_cost_usd desc;
$$;

grant execute on function public.get_admin_cost_by_user(timestamptz, timestamptz, text, numeric) to authenticated, service_role;

drop function if exists public.get_admin_cost_by_operation(timestamptz, timestamptz, text, numeric);
create or replace function public.get_admin_cost_by_operation(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text default 'day',
  p_whatsapp_eur_to_usd numeric default 1.08
)
returns table (
  bucket_start timestamptz,
  operation_family text,
  operation_name text,
  source text,
  provider text,
  model text,
  cost_domain text,
  ai_cost_usd numeric,
  whatsapp_cost_eur numeric,
  total_cost_usd numeric,
  total_calls bigint,
  total_tokens bigint
)
language sql
security definer
set search_path = public
as $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select *
    from public.cost_fact_events c, admin_guard
    where c.created_at >= p_start and c.created_at < p_end
  )
  select
    public.cost_bucket(b.created_at, p_bucket) as bucket_start,
    b.operation_family,
    b.operation_name,
    b.source,
    b.provider,
    b.model,
    b.cost_domain,
    sum(b.cost_usd)::numeric as ai_cost_usd,
    sum(b.cost_eur)::numeric as whatsapp_cost_eur,
    (sum(b.cost_usd) + sum(b.cost_eur) * p_whatsapp_eur_to_usd)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    sum(b.total_tokens)::bigint as total_tokens
  from base b
  group by 1,2,3,4,5,6,7
  order by 1 desc, total_cost_usd desc;
$$;

grant execute on function public.get_admin_cost_by_operation(timestamptz, timestamptz, text, numeric) to authenticated, service_role;

drop function if exists public.get_admin_daily_cost_synthesis(date, numeric);
create or replace function public.get_admin_daily_cost_synthesis(
  p_target_day date,
  p_whatsapp_eur_to_usd numeric default 1.08
)
returns table (
  target_day date,
  ai_cost_usd numeric,
  whatsapp_cost_eur numeric,
  total_cost_usd numeric,
  total_calls bigint,
  total_tokens bigint,
  unique_users bigint,
  unpriced_event_count bigint,
  top_operation_family text,
  top_model text
)
language sql
security definer
set search_path = public
as $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  day_range as (
    select p_target_day::timestamptz as s, (p_target_day::timestamptz + interval '1 day') as e
  ),
  facts as (
    select c.*
    from public.cost_fact_events c, day_range d, admin_guard
    where c.created_at >= d.s and c.created_at < d.e
  ),
  top_family as (
    select operation_family
    from facts
    group by 1
    order by sum(cost_usd + (cost_eur * p_whatsapp_eur_to_usd)) desc
    limit 1
  ),
  top_model as (
    select model
    from facts
    group by 1
    order by sum(cost_usd + (cost_eur * p_whatsapp_eur_to_usd)) desc
    limit 1
  )
  select
    p_target_day as target_day,
    coalesce(sum(f.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(f.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(f.cost_usd + (f.cost_eur * p_whatsapp_eur_to_usd)), 0)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(f.total_tokens), 0)::bigint as total_tokens,
    count(distinct f.user_id)::bigint as unique_users,
    (
      select count(*)::bigint
      from public.llm_usage_events ue, day_range d
      where ue.created_at >= d.s and ue.created_at < d.e and coalesce(ue.cost_unpriced, false) = true
    ) as unpriced_event_count,
    (select operation_family from top_family) as top_operation_family,
    (select model from top_model) as top_model
  from facts f;
$$;

grant execute on function public.get_admin_daily_cost_synthesis(date, numeric) to authenticated, service_role;

drop function if exists public.get_admin_cost_compare_previous(timestamptz, timestamptz, numeric);
create or replace function public.get_admin_cost_compare_previous(
  p_start timestamptz,
  p_end timestamptz,
  p_whatsapp_eur_to_usd numeric default 1.08
)
returns table (
  current_total_cost_usd numeric,
  previous_total_cost_usd numeric,
  delta_cost_usd numeric,
  delta_pct numeric,
  current_calls bigint,
  previous_calls bigint
)
language sql
security definer
set search_path = public
as $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  dur as (
    select greatest(extract(epoch from (p_end - p_start)), 1) as seconds
  ),
  cur as (
    select
      coalesce(sum(c.cost_usd + (c.cost_eur * p_whatsapp_eur_to_usd)), 0)::numeric as total_cost,
      count(*)::bigint as calls
    from public.cost_fact_events c, admin_guard
    where c.created_at >= p_start and c.created_at < p_end
  ),
  prev as (
    select
      coalesce(sum(c.cost_usd + (c.cost_eur * p_whatsapp_eur_to_usd)), 0)::numeric as total_cost,
      count(*)::bigint as calls
    from public.cost_fact_events c, dur d, admin_guard
    where c.created_at >= (p_start - make_interval(secs => d.seconds))
      and c.created_at < p_start
  )
  select
    cur.total_cost as current_total_cost_usd,
    prev.total_cost as previous_total_cost_usd,
    (cur.total_cost - prev.total_cost)::numeric as delta_cost_usd,
    case
      when prev.total_cost = 0 then null
      else (((cur.total_cost - prev.total_cost) / prev.total_cost) * 100)::numeric
    end as delta_pct,
    cur.calls as current_calls,
    prev.calls as previous_calls
  from cur, prev;
$$;

grant execute on function public.get_admin_cost_compare_previous(timestamptz, timestamptz, numeric) to authenticated, service_role;

drop function if exists public.get_admin_cost_data_quality(timestamptz, timestamptz);
create or replace function public.get_admin_cost_data_quality(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  missing_user_events bigint,
  unpriced_events bigint,
  missing_operation_events bigint,
  missing_source_events bigint
)
language sql
security definer
set search_path = public
as $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select ue.*
    from public.llm_usage_events ue, admin_guard
    where ue.created_at >= p_start and ue.created_at < p_end
  )
  select
    count(*) filter (where user_id is null)::bigint as missing_user_events,
    count(*) filter (where coalesce(cost_unpriced, false) = true)::bigint as unpriced_events,
    count(*) filter (where coalesce(operation_family, '') = '' or coalesce(operation_name, '') = '')::bigint as missing_operation_events,
    count(*) filter (where coalesce(source, '') = '')::bigint as missing_source_events
  from base;
$$;

grant execute on function public.get_admin_cost_data_quality(timestamptz, timestamptz) to authenticated, service_role;

-- Manual backfill helper for template costs from already received "sent" statuses.
drop function if exists public.backfill_whatsapp_template_cost_events(timestamptz);
create or replace function public.backfill_whatsapp_template_cost_events(
  p_from timestamptz default now() - interval '90 day'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count bigint := 0;
begin
  insert into public.whatsapp_cost_events (
    event_date,
    user_id,
    outbound_message_id,
    provider_message_id,
    purpose,
    template_name,
    template_language,
    unit_cost_eur,
    final_cost_eur,
    currency,
    billable,
    billing_status,
    billed_at,
    metadata
  )
  select
    coalesce((s.status_timestamp)::date, now()::date) as event_date,
    m.user_id,
    m.id as outbound_message_id,
    m.provider_message_id,
    nullif(m.metadata->>'purpose', '') as purpose,
    nullif(coalesce(m.metadata->>'template_name', m.graph_payload->'template'->>'name'), '') as template_name,
    nullif(coalesce(m.metadata->>'template_language', m.graph_payload->'template'->'language'->>'code'), '') as template_language,
    coalesce((m.metadata->>'unit_cost_eur')::numeric, 0.0712) as unit_cost_eur,
    coalesce((m.metadata->>'unit_cost_eur')::numeric, 0.0712) as final_cost_eur,
    'EUR' as currency,
    true as billable,
    'sent' as billing_status,
    coalesce(s.status_timestamp, now()) as billed_at,
    jsonb_build_object('source', 'backfill', 'status_event_id', s.id)
  from public.whatsapp_outbound_messages m
  join lateral (
    select se.id, se.status_timestamp
    from public.whatsapp_outbound_status_events se
    where se.provider_message_id = m.provider_message_id
      and lower(se.status) = 'sent'
    order by se.created_at asc
    limit 1
  ) s on true
  where m.message_type = 'template'
    and m.created_at >= p_from
    and m.provider_message_id is not null
  on conflict (provider_message_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.backfill_whatsapp_template_cost_events(timestamptz) to service_role;

-- 7) Seed pricing coverage for active models (values editable in admin).
insert into public.llm_pricing (provider, model, input_per_1k_tokens_usd, output_per_1k_tokens_usd, currency, pricing_version, is_active)
values
  ('gemini', 'gemini-2.5-flash', 0, 0, 'USD', 'v1', true),
  ('gemini', 'gemini-2.0-flash', 0, 0, 'USD', 'v1', true),
  ('gemini', 'gemini-embedding-001', 0, 0, 'USD', 'v1', true),
  ('openai', 'gpt-5', 0, 0, 'USD', 'v1', true),
  ('openai', 'gpt-5-mini', 0, 0, 'USD', 'v1', true),
  ('openai', 'gpt-5-nano', 0, 0, 'USD', 'v1', true)
on conflict (provider, model) do update
set
  currency = excluded.currency,
  pricing_version = excluded.pricing_version,
  is_active = excluded.is_active;

create or replace function public.normalize_cost_operation_family(
  p_operation_family text,
  p_source text
)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_operation_family, ''))) not in ('', 'other') then lower(trim(p_operation_family))
    when lower(coalesce(p_source, '')) like '%embed%' then 'embedding'
    when lower(coalesce(p_source, '')) like '%generate-plan%' or lower(coalesce(p_source, '')) like '%plan%' then 'plan_generation'
    when lower(coalesce(p_source, '')) like '%dispatcher%' then 'dispatcher'
    when lower(coalesce(p_source, '')) like '%sort-priorities%' then 'sort_priorities'
    when lower(coalesce(p_source, '')) like '%summarize-context%' or lower(coalesce(p_source, '')) like '%summary%' then 'summarize_context'
    when lower(coalesce(p_source, '')) like '%ethical%' then 'ethics_check'
    when lower(coalesce(p_source, '')) like '%companion%' or lower(coalesce(p_source, '')) like '%investigator%' or lower(coalesce(p_source, '')) like '%firefighter%' or lower(coalesce(p_source, '')) like '%sentry%' then 'message_generation'
    when lower(coalesce(p_source, '')) like '%memorizer%' or lower(coalesce(p_source, '')) like '%topic_memory%' or lower(coalesce(p_source, '')) like '%topic_%' or lower(coalesce(p_source, '')) like '%synthesizer%' then 'memorizer'
    when lower(coalesce(p_source, '')) like '%watcher%' then 'watcher'
    when lower(coalesce(p_source, '')) like '%schedule%' or lower(coalesce(p_source, '')) like '%checkin%' or lower(coalesce(p_source, '')) like '%reminder%' then 'scheduling'
    when lower(coalesce(p_source, '')) like '%duplicate%' then 'duplicate_check'
    else 'other'
  end
$$;

create or replace function public.normalize_cost_operation_name(
  p_operation_name text,
  p_source text
)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(nullif(p_operation_name, ''), nullif(p_source, ''), 'unknown')))
$$;

drop function if exists public.get_admin_cost_overview(timestamptz, timestamptz, text, numeric);
create or replace function public.get_admin_cost_overview(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text default 'day',
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null
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
    where c.created_at >= p_start
      and c.created_at < p_end
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
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

grant execute on function public.get_admin_cost_overview(timestamptz, timestamptz, text, numeric, text, text, text, text) to authenticated, service_role;

drop function if exists public.get_admin_cost_by_user(timestamptz, timestamptz, text, numeric);
create or replace function public.get_admin_cost_by_user(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text default 'day',
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null
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
    where c.created_at >= p_start
      and c.created_at < p_end
      and c.user_id is not null
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
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

grant execute on function public.get_admin_cost_by_user(timestamptz, timestamptz, text, numeric, text, text, text, text) to authenticated, service_role;

drop function if exists public.get_admin_cost_by_operation(timestamptz, timestamptz, text, numeric);
create or replace function public.get_admin_cost_by_operation(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text default 'day',
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null
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
    where c.created_at >= p_start
      and c.created_at < p_end
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
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

grant execute on function public.get_admin_cost_by_operation(timestamptz, timestamptz, text, numeric, text, text, text, text) to authenticated, service_role;

drop function if exists public.get_admin_daily_cost_synthesis(date, numeric);
create or replace function public.get_admin_daily_cost_synthesis(
  p_target_day date,
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null
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
    where c.created_at >= d.s
      and c.created_at < d.e
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
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
      where ue.created_at >= d.s
        and ue.created_at < d.e
        and coalesce(ue.cost_unpriced, false) = true
        and (coalesce(p_provider, '') = '' or lower(coalesce(ue.provider, '')) = lower(p_provider))
        and (coalesce(p_model, '') = '' or lower(coalesce(ue.model, '')) = lower(p_model))
        and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(ue.operation_family, ue.source) = lower(p_family))
        and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(ue.operation_name, ue.source) = lower(p_operation))
    ) as unpriced_event_count,
    (select operation_family from top_family) as top_operation_family,
    (select model from top_model) as top_model
  from facts f;
$$;

grant execute on function public.get_admin_daily_cost_synthesis(date, numeric, text, text, text, text) to authenticated, service_role;

drop function if exists public.get_admin_cost_compare_previous(timestamptz, timestamptz, numeric);
create or replace function public.get_admin_cost_compare_previous(
  p_start timestamptz,
  p_end timestamptz,
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null
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
    where c.created_at >= p_start
      and c.created_at < p_end
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  ),
  prev as (
    select
      coalesce(sum(c.cost_usd + (c.cost_eur * p_whatsapp_eur_to_usd)), 0)::numeric as total_cost,
      count(*)::bigint as calls
    from public.cost_fact_events c, dur d, admin_guard
    where c.created_at >= (p_start - make_interval(secs => d.seconds))
      and c.created_at < p_start
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
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

grant execute on function public.get_admin_cost_compare_previous(timestamptz, timestamptz, numeric, text, text, text, text) to authenticated, service_role;

drop function if exists public.get_admin_user_operation_breakdown(timestamptz, timestamptz, uuid, numeric);
create or replace function public.get_admin_user_operation_breakdown(
  p_start timestamptz,
  p_end timestamptz,
  p_user_id uuid,
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null
)
returns table (
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
    where c.created_at >= p_start
      and c.created_at < p_end
      and c.user_id = p_user_id
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  )
  select
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
  group by 1,2,3,4,5,6
  order by total_cost_usd desc, total_calls desc;
$$;

grant execute on function public.get_admin_user_operation_breakdown(timestamptz, timestamptz, uuid, numeric, text, text, text, text) to authenticated, service_role;

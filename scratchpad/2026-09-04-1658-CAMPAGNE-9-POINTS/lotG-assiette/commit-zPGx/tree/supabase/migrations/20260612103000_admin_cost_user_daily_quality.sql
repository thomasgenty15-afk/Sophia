-- Admin cost observability v2.
-- Adds run/environment classification, user/day cost reporting, and richer
-- data-quality metrics without changing existing raw cost event tables.

create or replace function public.cost_metadata_run_type(p_metadata jsonb)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_metadata->>'run_type', p_metadata->>'runType', ''))) <> ''
      then lower(trim(coalesce(p_metadata->>'run_type', p_metadata->>'runType')))
    when coalesce(p_metadata->>'eval_run_id', p_metadata->>'evalRunId', '') <> ''
      then 'eval'
    when coalesce(p_metadata->>'qa_run_id', p_metadata->>'qaRunId', '') <> ''
      then 'qa'
    when coalesce(p_metadata->>'smoke_run_id', p_metadata->>'smokeRunId', '') <> ''
      then 'smoke'
    when lower(coalesce(p_metadata->>'source', '')) like '%eval%'
      then 'eval'
    when lower(coalesce(p_metadata->>'source', '')) like '%qa%'
      then 'qa'
    else 'prod'
  end
$$;

create or replace function public.cost_metadata_environment(p_metadata jsonb)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_metadata->>'environment', p_metadata->>'env', ''))) <> ''
      then lower(trim(coalesce(p_metadata->>'environment', p_metadata->>'env')))
    when lower(trim(coalesce(p_metadata->>'is_local', p_metadata->>'local', ''))) in ('true','1','yes')
      then 'local'
    else 'prod'
  end
$$;

create or replace view public.cost_fact_events_enriched as
select
  ue.created_at,
  ue.user_id,
  coalesce(ue.operation_family, 'other'::text) as operation_family,
  coalesce(ue.operation_name, ue.source, 'unknown'::text) as operation_name,
  ue.source,
  ue.provider,
  ue.model,
  ue.kind,
  coalesce(ue.prompt_tokens, 0) as prompt_tokens,
  coalesce(ue.output_tokens, 0) as output_tokens,
  coalesce(ue.total_tokens, 0) as total_tokens,
  coalesce(ue.cost_usd, 0::numeric) as cost_usd,
  0::numeric as cost_eur,
  'ai'::text as cost_domain,
  coalesce(ue.cost_unpriced, false) as cost_unpriced,
  ue.status,
  ue.channel,
  ue.request_id,
  ue.metadata,
  public.cost_metadata_run_type(ue.metadata) as run_type,
  public.cost_metadata_environment(ue.metadata) as environment
from public.llm_usage_events ue
union all
select
  wce.billed_at as created_at,
  wce.user_id,
  'whatsapp_template'::text as operation_family,
  coalesce(wce.purpose, 'template_send'::text) as operation_name,
  'whatsapp-template'::text as source,
  'meta'::text as provider,
  coalesce(wce.template_name, 'template'::text) as model,
  'template'::text as kind,
  0 as prompt_tokens,
  0 as output_tokens,
  0 as total_tokens,
  0::numeric as cost_usd,
  coalesce(wce.final_cost_eur, 0::numeric) as cost_eur,
  'whatsapp'::text as cost_domain,
  false as cost_unpriced,
  wce.billing_status as status,
  'whatsapp'::text as channel,
  null::text as request_id,
  wce.metadata,
  public.cost_metadata_run_type(wce.metadata) as run_type,
  public.cost_metadata_environment(wce.metadata) as environment
from public.whatsapp_cost_events wce
where wce.billable = true
  and lower(wce.billing_status) = 'sent';

create or replace function public.admin_cost_run_type_matches(p_event_run_type text, p_filter text)
returns boolean
language sql
immutable
as $$
  select case
    when coalesce(trim(p_filter), '') = '' or lower(trim(p_filter)) = 'all' then true
    when lower(trim(p_filter)) = 'non_prod' then lower(coalesce(p_event_run_type, 'prod')) <> 'prod'
    else lower(coalesce(p_event_run_type, 'prod')) = lower(trim(p_filter))
  end
$$;

create or replace function public.get_admin_cost_data_quality_v2(
  p_start timestamptz,
  p_end timestamptz,
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_run_type text default 'all',
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null
)
returns table (
  total_events bigint,
  attributed_events bigint,
  unattributed_events bigint,
  unpriced_events bigint,
  missing_operation_events bigint,
  missing_source_events bigint,
  total_cost_usd numeric,
  attributed_cost_usd numeric,
  unattributed_cost_usd numeric,
  attribution_rate numeric,
  pricing_coverage_rate numeric
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
    select c.*
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  ),
  agg as (
    select
      count(*)::bigint as total_events,
      count(*) filter (where user_id is not null)::bigint as attributed_events,
      count(*) filter (where user_id is null)::bigint as unattributed_events,
      count(*) filter (where coalesce(cost_unpriced, false) = true)::bigint as unpriced_events,
      count(*) filter (where coalesce(operation_family, '') = '' or coalesce(operation_name, '') = '')::bigint as missing_operation_events,
      count(*) filter (where coalesce(source, '') = '')::bigint as missing_source_events,
      coalesce(sum(cost_usd + cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
      coalesce(sum(cost_usd + cost_eur * p_whatsapp_eur_to_usd) filter (where user_id is not null), 0)::numeric as attributed_cost_usd,
      coalesce(sum(cost_usd + cost_eur * p_whatsapp_eur_to_usd) filter (where user_id is null), 0)::numeric as unattributed_cost_usd
    from base
  )
  select
    total_events,
    attributed_events,
    unattributed_events,
    unpriced_events,
    missing_operation_events,
    missing_source_events,
    total_cost_usd,
    attributed_cost_usd,
    unattributed_cost_usd,
    case when total_events = 0 then 1 else attributed_events::numeric / total_events::numeric end as attribution_rate,
    case when total_events = 0 then 1 else (total_events - unpriced_events)::numeric / total_events::numeric end as pricing_coverage_rate
  from agg;
$$;

create or replace function public.get_admin_user_daily_costs(
  p_start timestamptz,
  p_end timestamptz,
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_run_type text default 'all',
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null
)
returns table (
  day date,
  user_id uuid,
  full_name text,
  email text,
  ai_cost_usd numeric,
  whatsapp_cost_eur numeric,
  whatsapp_cost_usd numeric,
  total_cost_usd numeric,
  prompt_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  total_calls bigint,
  unpriced_events bigint,
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
  base as (
    select c.*
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and c.user_id is not null
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  ),
  grouped as (
    select
      (date_trunc('day', b.created_at))::date as day,
      b.user_id,
      coalesce(p.full_name, 'Unknown') as full_name,
      coalesce(p.email, '') as email,
      coalesce(sum(b.cost_usd), 0)::numeric as ai_cost_usd,
      coalesce(sum(b.cost_eur), 0)::numeric as whatsapp_cost_eur,
      coalesce(sum(b.cost_eur) * p_whatsapp_eur_to_usd, 0)::numeric as whatsapp_cost_usd,
      coalesce(sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
      coalesce(sum(b.prompt_tokens), 0)::bigint as prompt_tokens,
      coalesce(sum(b.output_tokens), 0)::bigint as output_tokens,
      coalesce(sum(b.total_tokens), 0)::bigint as total_tokens,
      count(*)::bigint as total_calls,
      count(*) filter (where coalesce(b.cost_unpriced, false) = true)::bigint as unpriced_events
    from base b
    left join public.profiles p on p.id = b.user_id
    group by 1, 2, 3, 4
  ),
  ranked_family as (
    select
      (date_trunc('day', b.created_at))::date as day,
      b.user_id,
      public.normalize_cost_operation_family(b.operation_family, b.source) as operation_family,
      row_number() over (
        partition by (date_trunc('day', b.created_at))::date, b.user_id
        order by sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd) desc, count(*) desc
      ) as rn
    from base b
    group by 1, 2, 3
  ),
  ranked_model as (
    select
      (date_trunc('day', b.created_at))::date as day,
      b.user_id,
      b.model,
      row_number() over (
        partition by (date_trunc('day', b.created_at))::date, b.user_id
        order by sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd) desc, count(*) desc
      ) as rn
    from base b
    group by 1, 2, 3
  )
  select
    g.day,
    g.user_id,
    g.full_name,
    g.email,
    g.ai_cost_usd,
    g.whatsapp_cost_eur,
    g.whatsapp_cost_usd,
    g.total_cost_usd,
    g.prompt_tokens,
    g.output_tokens,
    g.total_tokens,
    g.total_calls,
    g.unpriced_events,
    rf.operation_family as top_operation_family,
    rm.model as top_model
  from grouped g
  left join ranked_family rf on rf.day = g.day and rf.user_id = g.user_id and rf.rn = 1
  left join ranked_model rm on rm.day = g.day and rm.user_id = g.user_id and rm.rn = 1
  order by g.day desc, g.total_cost_usd desc;
$$;

create or replace function public.get_admin_cost_overview(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text default 'day',
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null,
  p_run_type text default 'all'
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
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  )
  select
    public.cost_bucket(b.created_at, p_bucket) as bucket_start,
    coalesce(sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
    coalesce(sum(b.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(b.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(b.cost_eur) * p_whatsapp_eur_to_usd, 0)::numeric as whatsapp_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(b.total_tokens), 0)::bigint as total_tokens,
    count(distinct b.user_id)::bigint as unique_users
  from base b
  group by 1
  order by 1 desc;
$$;

create or replace function public.get_admin_cost_by_user(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text default 'day',
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null,
  p_run_type text default 'all'
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
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and c.user_id is not null
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
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
    coalesce(sum(b.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(b.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(b.total_tokens), 0)::bigint as total_tokens
  from base b
  left join public.profiles p on p.id = b.user_id
  group by 1, 2, 3, 4
  order by 1 desc, total_cost_usd desc;
$$;

create or replace function public.get_admin_cost_by_operation(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text default 'day',
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null,
  p_run_type text default 'all'
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
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
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
    coalesce(sum(b.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(b.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(b.total_tokens), 0)::bigint as total_tokens
  from base b
  group by 1,2,3,4,5,6,7
  order by 1 desc, total_cost_usd desc;
$$;

create or replace function public.get_admin_cost_compare_previous(
  p_start timestamptz,
  p_end timestamptz,
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null,
  p_run_type text default 'all'
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
      coalesce(sum(c.cost_usd + c.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost,
      count(*)::bigint as calls
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  ),
  prev as (
    select
      coalesce(sum(c.cost_usd + c.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost,
      count(*)::bigint as calls
    from public.cost_fact_events_enriched c, dur d, admin_guard
    where c.created_at >= (p_start - make_interval(secs => d.seconds))
      and c.created_at < p_start
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  )
  select
    cur.total_cost as current_total_cost_usd,
    prev.total_cost as previous_total_cost_usd,
    (cur.total_cost - prev.total_cost)::numeric as delta_cost_usd,
    case when prev.total_cost = 0 then null else (((cur.total_cost - prev.total_cost) / prev.total_cost) * 100)::numeric end as delta_pct,
    cur.calls as current_calls,
    prev.calls as previous_calls
  from cur, prev;
$$;

create or replace function public.get_admin_daily_cost_synthesis(
  p_target_day date,
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null,
  p_run_type text default 'all'
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
    from public.cost_fact_events_enriched c, day_range d, admin_guard
    where c.created_at >= d.s
      and c.created_at < d.e
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  ),
  top_family as (
    select operation_family
    from facts
    group by 1
    order by sum(cost_usd + cost_eur * p_whatsapp_eur_to_usd) desc
    limit 1
  ),
  top_model as (
    select model
    from facts
    group by 1
    order by sum(cost_usd + cost_eur * p_whatsapp_eur_to_usd) desc
    limit 1
  )
  select
    p_target_day as target_day,
    coalesce(sum(f.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(f.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(f.cost_usd + f.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(f.total_tokens), 0)::bigint as total_tokens,
    count(distinct f.user_id)::bigint as unique_users,
    count(*) filter (where coalesce(f.cost_unpriced, false) = true)::bigint as unpriced_event_count,
    (select operation_family from top_family) as top_operation_family,
    (select model from top_model) as top_model
  from facts f;
$$;

create or replace function public.get_admin_user_operation_breakdown(
  p_start timestamptz,
  p_end timestamptz,
  p_user_id uuid,
  p_whatsapp_eur_to_usd numeric default 1.08,
  p_provider text default null,
  p_model text default null,
  p_family text default null,
  p_operation text default null,
  p_run_type text default 'all'
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
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and c.user_id = p_user_id
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
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
    coalesce(sum(b.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(b.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(b.total_tokens), 0)::bigint as total_tokens
  from base b
  group by 1,2,3,4,5,6
  order by total_cost_usd desc, total_calls desc;
$$;

grant select on public.cost_fact_events_enriched to service_role;
grant all on function public.cost_metadata_run_type(jsonb) to anon, authenticated, service_role;
grant all on function public.cost_metadata_environment(jsonb) to anon, authenticated, service_role;
grant all on function public.admin_cost_run_type_matches(text, text) to anon, authenticated, service_role;
grant all on function public.get_admin_cost_data_quality_v2(timestamptz, timestamptz, numeric, text, text, text, text, text) to anon, authenticated, service_role;
grant all on function public.get_admin_user_daily_costs(timestamptz, timestamptz, numeric, text, text, text, text, text) to anon, authenticated, service_role;
grant all on function public.get_admin_cost_overview(timestamptz, timestamptz, text, numeric, text, text, text, text, text) to anon, authenticated, service_role;
grant all on function public.get_admin_cost_by_user(timestamptz, timestamptz, text, numeric, text, text, text, text, text) to anon, authenticated, service_role;
grant all on function public.get_admin_cost_by_operation(timestamptz, timestamptz, text, numeric, text, text, text, text, text) to anon, authenticated, service_role;
grant all on function public.get_admin_cost_compare_previous(timestamptz, timestamptz, numeric, text, text, text, text, text) to anon, authenticated, service_role;
grant all on function public.get_admin_daily_cost_synthesis(date, numeric, text, text, text, text, text) to anon, authenticated, service_role;
grant all on function public.get_admin_user_operation_breakdown(timestamptz, timestamptz, uuid, numeric, text, text, text, text, text) to anon, authenticated, service_role;

drop function if exists public.get_admin_user_operation_breakdown(timestamptz, timestamptz, uuid, numeric);
create or replace function public.get_admin_user_operation_breakdown(
  p_start timestamptz,
  p_end timestamptz,
  p_user_id uuid,
  p_whatsapp_eur_to_usd numeric default 1.08
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

grant execute on function public.get_admin_user_operation_breakdown(timestamptz, timestamptz, uuid, numeric) to authenticated, service_role;

-- Update the RPC to include revenue per user (placeholder for now)
drop function if exists public.get_admin_user_stats(timestamptz);

create or replace function public.get_admin_user_stats(period_start timestamptz)
returns table (
  user_id uuid,
  full_name text,
  email text,
  plans_count bigint,
  messages_count bigint,
  total_cost_usd numeric,
  total_revenue_usd numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.internal_admins where user_id = auth.uid()) then
    raise exception 'Access denied';
  end if;

  return query
  select
    p.id as user_id,
    coalesce(p.full_name, 'Unknown') as full_name,
    coalesce(u.email, 'No Email') as email,
    count(distinct pl.id) as plans_count,
    count(distinct m.id) as messages_count,
    coalesce(sum(ue.cost_usd), 0) as total_cost_usd,
    -- Placeholder for revenue: currently 0 as no payment system is linked yet
    0::numeric as total_revenue_usd
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_plans pl on pl.user_id = p.id and pl.created_at >= period_start
  left join public.chat_messages m on m.user_id = p.id and m.created_at >= period_start
  left join public.llm_usage_events ue on ue.user_id = p.id and ue.created_at >= period_start
  group by p.id, p.full_name, u.email
  order by total_cost_usd desc, messages_count desc;
end;
$$;


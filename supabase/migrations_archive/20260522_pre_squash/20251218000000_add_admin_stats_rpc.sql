-- Function to get per-user stats for the admin dashboard
create or replace function public.get_admin_user_stats(period_start timestamptz)
returns table (
  user_id uuid,
  full_name text,
  email text,
  plans_count bigint,
  messages_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Check if the requesting user is an internal admin
  if not exists (select 1 from public.internal_admins where user_id = auth.uid()) then
    raise exception 'Access denied';
  end if;

  return query
  select
    p.id as user_id,
    coalesce(p.full_name, 'Unknown') as full_name,
    coalesce(u.email, 'No Email') as email,
    count(distinct pl.id) as plans_count,
    count(distinct m.id) as messages_count
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_plans pl on pl.user_id = p.id and pl.created_at >= period_start
  left join public.chat_messages m on m.user_id = p.id and m.created_at >= period_start
  group by p.id, p.full_name, u.email
  order by messages_count desc;
end;
$$;

-- Function to get global AI cost
create or replace function public.get_global_ai_cost(period_start timestamptz)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Check if the requesting user is an internal admin
  if not exists (select 1 from public.internal_admins where user_id = auth.uid()) then
    raise exception 'Access denied';
  end if;

  return (
    select coalesce(sum(cost_usd), 0)
    from public.llm_usage_events
    where created_at >= period_start
  );
end;
$$;


-- Function to get usage stats broken down by source (e.g. specific edge functions)
create or replace function public.get_usage_by_source(period_start timestamptz)
returns table (
  source text,
  total_cost_usd numeric,
  total_tokens bigint,
  call_count bigint
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
    coalesce(ue.source, '(unknown)') as source,
    coalesce(sum(ue.cost_usd), 0) as total_cost_usd,
    coalesce(sum(ue.total_tokens), 0) as total_tokens,
    count(*) as call_count
  from public.llm_usage_events ue
  where ue.created_at >= period_start
  group by 1
  order by total_cost_usd desc;
end;
$$;


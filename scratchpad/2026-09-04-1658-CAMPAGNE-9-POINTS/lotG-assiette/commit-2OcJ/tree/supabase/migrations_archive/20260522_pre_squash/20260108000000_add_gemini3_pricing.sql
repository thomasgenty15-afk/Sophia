insert into public.llm_pricing (provider, model, input_per_1k_tokens_usd, output_per_1k_tokens_usd)
values
  -- Gemini 3.0 Pro Preview
  -- Input: $2.00 / 1M tokens = $0.002 / 1k tokens
  -- Output: $12.00 / 1M tokens = $0.012 / 1k tokens
  ('gemini', 'gemini-3-pro-preview', 0.002, 0.012),

  -- Gemini 3.0 Flash Preview
  -- Input: $0.50 / 1M tokens = $0.0005 / 1k tokens
  -- Output: $3.00 / 1M tokens = $0.003 / 1k tokens
  ('gemini', 'gemini-3-flash-preview', 0.0005, 0.003)
on conflict (provider, model) do update
set 
  input_per_1k_tokens_usd = excluded.input_per_1k_tokens_usd,
  output_per_1k_tokens_usd = excluded.output_per_1k_tokens_usd,
  updated_at = now();

-- Function to get usage stats broken down by model
create or replace function public.get_usage_by_model(period_start timestamptz)
returns table (
  model text,
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
    coalesce(ue.model, '(unknown)') as model,
    coalesce(sum(ue.cost_usd), 0) as total_cost_usd,
    coalesce(sum(ue.total_tokens), 0) as total_tokens,
    count(*) as call_count
  from public.llm_usage_events ue
  where ue.created_at >= period_start
  group by 1
  order by total_cost_usd desc;
end;
$$;

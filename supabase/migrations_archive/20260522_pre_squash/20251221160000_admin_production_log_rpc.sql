-- Admin "Production log" RPC: unified timeline across key system tables.
-- This is designed for the Admin UI to get an overview of activity + errors in one request.
--
-- Security:
-- - SECURITY DEFINER to bypass RLS
-- - Explicitly checks the caller is in public.internal_admins (auth.uid()).

create or replace function public.get_production_log(
  p_since timestamptz default (now() - interval '24 hours'),
  p_limit integer default 200,
  p_only_errors boolean default false,
  p_source text default null
)
returns table (
  ts timestamptz,
  severity text,
  source text,
  event_type text,
  title text,
  user_id uuid,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Admin gate
  if not exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;

  return query
  with events as (
    ---------------------------------------------------------------------------
    -- Emails / comms
    ---------------------------------------------------------------------------
    select
      cl.created_at as ts,
      case
        when cl.status = 'failed' then 'error'
        when cl.status in ('sent','delivered') then 'info'
        else 'warn'
      end as severity,
      cl.channel as source,
      cl.type as event_type,
      case
        when cl.status = 'failed' then 'Email failed'
        when cl.status = 'delivered' then 'Email delivered'
        else 'Email sent'
      end || ' · ' || cl.type as title,
      cl.user_id,
      jsonb_build_object(
        'status', cl.status,
        'channel', cl.channel,
        'type', cl.type,
        'metadata', cl.metadata
      ) as details
    from public.communication_logs cl
    where cl.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- LLM usage (cost/tokens) + potential errors if metadata contains an error field
    ---------------------------------------------------------------------------
    select
      ue.created_at as ts,
      case
        when (ue.metadata ? 'error') or (ue.metadata ? 'exception') or (ue.metadata ? 'failed') then 'error'
        else 'info'
      end as severity,
      coalesce(ue.source, 'llm') as source,
      'llm_usage' as event_type,
      'LLM ' || ue.kind || ' · ' || ue.model as title,
      null::uuid as user_id,
      jsonb_build_object(
        'provider', ue.provider,
        'model', ue.model,
        'kind', ue.kind,
        'prompt_tokens', ue.prompt_tokens,
        'output_tokens', ue.output_tokens,
        'total_tokens', ue.total_tokens,
        'cost_usd', ue.cost_usd,
        'request_id', ue.request_id,
        'metadata', ue.metadata
      ) as details
    from public.llm_usage_events ue
    where ue.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Stripe webhook idempotency events (received)
    ---------------------------------------------------------------------------
    select
      swe.received_at as ts,
      'info' as severity,
      'stripe' as source,
      'stripe_webhook' as event_type,
      'Stripe webhook received' as title,
      null::uuid as user_id,
      jsonb_build_object('event_id', swe.id) as details
    from public.stripe_webhook_events swe
    where swe.received_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Evals (helpful for spotting systemic failures during testing)
    ---------------------------------------------------------------------------
    select
      cer.created_at as ts,
      case
        when cer.status = 'failed' or cer.error is not null then 'error'
        else 'info'
      end as severity,
      'evals' as source,
      'conversation_eval_run' as event_type,
      'Eval run · ' || coalesce(cer.scenario_key, cer.dataset_key, 'unknown') as title,
      null::uuid as user_id,
      jsonb_build_object(
        'id', cer.id,
        'status', cer.status,
        'dataset_key', cer.dataset_key,
        'scenario_key', cer.scenario_key,
        'issues_count', coalesce(jsonb_array_length(cer.issues), 0),
        'suggestions_count', coalesce(jsonb_array_length(cer.suggestions), 0),
        'error', cer.error
      ) as details
    from public.conversation_eval_runs cer
    where cer.created_at >= p_since
  )
  select e.ts, e.severity, e.source, e.event_type, e.title, e.user_id, e.details
  from events e
  where
    (not p_only_errors or e.severity = 'error')
    and (p_source is null or e.source = p_source)
  order by e.ts desc
  limit greatest(1, least(p_limit, 1000));
end;
$$;



-- Harden LLM cost coverage after dispatcher/local-flow expansion.
-- Idempotent: updates pricing configuration and replaces normalization helpers.

insert into public.llm_pricing (
  provider,
  model,
  input_per_1k_tokens_usd,
  output_per_1k_tokens_usd,
  currency,
  pricing_version,
  is_active,
  effective_at
)
values
  -- OpenAI official standard pricing, per 1M tokens converted to per 1k.
  ('openai', 'gpt-5.4-mini', 0.00075, 0.0045, 'USD', 'openai_2026_06_12_standard', true, now()),

  -- Gemini official paid standard pricing, per 1M tokens converted to per 1k.
  -- For Gemini 3.1 Pro Preview, these are the <= 200k prompt prices.
  ('gemini', 'gemini-3.1-pro-preview', 0.002, 0.012, 'USD', 'google_2026_06_12_standard_le_200k', true, now()),
  ('gemini', 'gemini-3.1-pro-preview-customtools', 0.002, 0.012, 'USD', 'google_2026_06_12_standard_le_200k', true, now()),
  ('gemini', 'gemini-3-flash-preview', 0.0005, 0.003, 'USD', 'google_2026_06_12_standard', true, now()),
  ('gemini', 'gemini-3.1-flash-lite', 0.00025, 0.0015, 'USD', 'google_2026_06_12_standard_text', true, now())
on conflict (provider, model) do update
set
  input_per_1k_tokens_usd = excluded.input_per_1k_tokens_usd,
  output_per_1k_tokens_usd = excluded.output_per_1k_tokens_usd,
  currency = excluded.currency,
  pricing_version = excluded.pricing_version,
  is_active = excluded.is_active,
  effective_at = excluded.effective_at,
  updated_at = now();

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
    when lower(coalesce(p_source, '')) like '%generate-plan%' or lower(coalesce(p_source, '')) like '%plan%' or lower(coalesce(p_source, '')) like '%questionnaire%' or lower(coalesce(p_source, '')) like '%materialization%' or lower(coalesce(p_source, '')) like '%draft-transformation%' or lower(coalesce(p_source, '')) like '%intake-structuring%' then 'plan_generation'
    when lower(coalesce(p_source, '')) like '%dispatcher%' then 'dispatcher'
    when lower(coalesce(p_source, '')) like '%visible%' or lower(coalesce(p_source, '')) like '%direct_effect%' or lower(coalesce(p_source, '')) like '%defense-card%' or lower(coalesce(p_source, '')) like '%defense_card%' or lower(coalesce(p_source, '')) like '%attack-card%' or lower(coalesce(p_source, '')) like '%attack_card%' or lower(coalesce(p_source, '')) like '%inspiration%' or lower(coalesce(p_source, '')) like '%support-card%' or lower(coalesce(p_source, '')) like '%potion%' or lower(coalesce(p_source, '')) like '%bilan_stale%' or lower(coalesce(p_source, '')) like '%router_emergency%' then 'message_generation'
    when lower(coalesce(p_source, '')) like '%conversation_pulse%' or lower(coalesce(p_source, '')) like '%weekly_conversation_digest%' or lower(coalesce(p_source, '')) like '%weekly_digest%' or lower(coalesce(p_source, '')) like '%summary%' or lower(coalesce(p_source, '')) like '%identity-manager%' or lower(coalesce(p_source, '')) like '%architect-memory%' then 'summary_generation'
    when lower(coalesce(p_source, '')) like '%ethical%' then 'ethics_check'
    when lower(coalesce(p_source, '')) like '%companion%' or lower(coalesce(p_source, '')) like '%firefighter%' or lower(coalesce(p_source, '')) like '%sentry%' then 'message_generation'
    when lower(coalesce(p_source, '')) like '%memorizer%' or lower(coalesce(p_source, '')) like '%topic_memory%' or lower(coalesce(p_source, '')) like '%topic_%' or lower(coalesce(p_source, '')) like '%synthesizer%' or lower(coalesce(p_source, '')) like '%memory-v2%' then 'memorizer'
    when lower(coalesce(p_source, '')) like '%watcher%' then 'watcher'
    when lower(coalesce(p_source, '')) like '%schedule%' or lower(coalesce(p_source, '')) like '%checkin%' or lower(coalesce(p_source, '')) like '%reminder%' or lower(coalesce(p_source, '')) like '%future-events%' then 'scheduling'
    when lower(coalesce(p_source, '')) like '%professional-support%' or lower(coalesce(p_source, '')) like '%level-tools%' then 'classification'
    when lower(coalesce(p_source, '')) like '%duplicate%' then 'duplicate_check'
    else 'other'
  end
$$;

create or replace function public.get_admin_cost_coverage_gaps(
  p_start timestamptz,
  p_end timestamptz,
  p_run_type text default 'all'
)
returns table (
  gap_type text,
  provider text,
  model text,
  source text,
  operation_family text,
  event_count bigint,
  total_cost_usd numeric
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
    select
      provider,
      model,
      source,
      public.normalize_cost_operation_family(operation_family, source) as operation_family,
      user_id,
      coalesce(cost_unpriced, false) as cost_unpriced,
      coalesce(cost_usd, 0::numeric) as cost_usd,
      metadata
    from public.llm_usage_events, admin_guard
    where created_at >= p_start
      and created_at < p_end
      and public.admin_cost_run_type_matches(public.cost_metadata_run_type(metadata), p_run_type)
  ),
  gaps as (
    select 'unpriced_model'::text as gap_type, provider, model, source, operation_family, count(*)::bigint as event_count, sum(cost_usd)::numeric as total_cost_usd
    from base
    where cost_unpriced = true
    group by provider, model, source, operation_family
    union all
    select 'unattributed_user'::text as gap_type, provider, model, source, operation_family, count(*)::bigint as event_count, sum(cost_usd)::numeric as total_cost_usd
    from base
    where user_id is null
    group by provider, model, source, operation_family
    union all
    select 'unclassified_operation'::text as gap_type, provider, model, source, operation_family, count(*)::bigint as event_count, sum(cost_usd)::numeric as total_cost_usd
    from base
    where operation_family = 'other'
    group by provider, model, source, operation_family
  )
  select *
  from gaps
  order by event_count desc, gap_type, provider, model, source;
$$;

grant all on function public.normalize_cost_operation_family(text, text) to anon, authenticated, service_role;
grant all on function public.get_admin_cost_coverage_gaps(timestamptz, timestamptz, text) to anon, authenticated, service_role;

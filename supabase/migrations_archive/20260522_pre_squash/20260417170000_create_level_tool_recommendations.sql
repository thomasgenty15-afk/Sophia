create table if not exists public.user_level_tool_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid not null references public.user_plans_v2(id) on delete cascade,
  plan_version integer not null check (plan_version >= 1),
  plan_updated_at timestamptz not null,
  target_level_id text null,
  target_level_order integer not null check (target_level_order >= 2),
  priority_rank integer not null check (priority_rank between 1 and 2),
  tool_type text not null check (tool_type in ('app', 'product')),
  category_key text not null check (
    category_key in (
      'measurement_tracking',
      'symptom_tracking',
      'sleep_support',
      'nutrition_prep',
      'hydration_support',
      'movement_training',
      'recovery_mobility',
      'pain_relief_support',
      'distraction_blocking',
      'reproductive_health',
      'consumption_reduction',
      'workspace_ergonomics'
    )
  ),
  subcategory_key text null,
  display_name text not null,
  brand_name text null,
  reason text not null,
  why_this_level text not null,
  confidence_score integer not null check (confidence_score between 95 and 100),
  status text not null default 'recommended' check (
    status in ('recommended', 'installed', 'purchased', 'already_owned', 'not_relevant')
  ),
  is_active boolean not null default true,
  superseded_by_recommendation_id uuid null references public.user_level_tool_recommendations(id) on delete set null,
  superseded_reason text null check (
    superseded_reason is null or superseded_reason in (
      'level_rewritten',
      'level_removed',
      'regenerated_after_plan_change',
      'level_recommendation_set_changed'
    )
  ),
  level_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_level_tool_recommendations_active_level_rank_idx
  on public.user_level_tool_recommendations(plan_id, target_level_order, priority_rank)
  where is_active = true;

create index if not exists user_level_tool_recommendations_active_idx
  on public.user_level_tool_recommendations(transformation_id, is_active, target_level_order, priority_rank);

create index if not exists user_level_tool_recommendations_plan_idx
  on public.user_level_tool_recommendations(plan_id, updated_at desc);

alter table public.user_level_tool_recommendations enable row level security;

drop policy if exists user_level_tool_recommendations_select_own on public.user_level_tool_recommendations;
create policy user_level_tool_recommendations_select_own
  on public.user_level_tool_recommendations
  for select
  using (auth.uid() = user_id);

drop policy if exists user_level_tool_recommendations_insert_own on public.user_level_tool_recommendations;
create policy user_level_tool_recommendations_insert_own
  on public.user_level_tool_recommendations
  for insert
  with check (auth.uid() = user_id);

drop policy if exists user_level_tool_recommendations_update_own on public.user_level_tool_recommendations;
create policy user_level_tool_recommendations_update_own
  on public.user_level_tool_recommendations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on table public.user_level_tool_recommendations to authenticated;
grant all on table public.user_level_tool_recommendations to service_role;

create table if not exists public.user_level_tool_recommendation_events (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.user_level_tool_recommendations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid not null references public.user_plans_v2(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'generated',
      'marked_installed',
      'marked_purchased',
      'marked_already_owned',
      'marked_not_relevant',
      'superseded_after_plan_adjustment',
      'regenerated_after_plan_adjustment'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_level_tool_recommendation_events_recommendation_idx
  on public.user_level_tool_recommendation_events(recommendation_id, created_at desc);

create index if not exists user_level_tool_recommendation_events_transformation_idx
  on public.user_level_tool_recommendation_events(transformation_id, created_at desc);

alter table public.user_level_tool_recommendation_events enable row level security;

drop policy if exists user_level_tool_recommendation_events_select_own on public.user_level_tool_recommendation_events;
create policy user_level_tool_recommendation_events_select_own
  on public.user_level_tool_recommendation_events
  for select
  using (auth.uid() = user_id);

drop policy if exists user_level_tool_recommendation_events_insert_own on public.user_level_tool_recommendation_events;
create policy user_level_tool_recommendation_events_insert_own
  on public.user_level_tool_recommendation_events
  for insert
  with check (auth.uid() = user_id);

grant all on table public.user_level_tool_recommendation_events to authenticated;
grant all on table public.user_level_tool_recommendation_events to service_role;

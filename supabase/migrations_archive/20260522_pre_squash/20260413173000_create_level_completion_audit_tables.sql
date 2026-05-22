create table if not exists public.user_plan_level_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid not null references public.user_plans_v2(id) on delete cascade,
  phase_id text not null,
  level_order integer not null check (level_order >= 1),
  level_title text not null,
  duration_weeks integer null check (duration_weeks is null or duration_weeks between 1 and 12),
  questionnaire_schema jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  review_summary jsonb not null default '{}'::jsonb,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists user_plan_level_reviews_plan_created_idx
  on public.user_plan_level_reviews(plan_id, created_at desc);

create index if not exists user_plan_level_reviews_transformation_created_idx
  on public.user_plan_level_reviews(transformation_id, created_at desc);

alter table public.user_plan_level_reviews enable row level security;

drop policy if exists user_plan_level_reviews_select_own on public.user_plan_level_reviews;
create policy user_plan_level_reviews_select_own
  on public.user_plan_level_reviews
  for select
  using (auth.uid() = user_id);

drop policy if exists user_plan_level_reviews_insert_own on public.user_plan_level_reviews;
create policy user_plan_level_reviews_insert_own
  on public.user_plan_level_reviews
  for insert
  with check (auth.uid() = user_id);

grant all on table public.user_plan_level_reviews to authenticated;
grant all on table public.user_plan_level_reviews to service_role;

create table if not exists public.user_plan_level_generation_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid null references public.user_plan_level_reviews(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid not null references public.user_plans_v2(id) on delete cascade,
  from_phase_id text not null,
  to_phase_id text null,
  decision text not null check (decision in ('keep', 'shorten', 'extend', 'lighten')),
  decision_reason text not null,
  generation_input jsonb not null default '{}'::jsonb,
  previous_current_level_runtime jsonb null,
  next_current_level_runtime jsonb null,
  previous_plan_blueprint jsonb null,
  next_plan_blueprint jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists user_plan_level_generation_events_plan_created_idx
  on public.user_plan_level_generation_events(plan_id, created_at desc);

create index if not exists user_plan_level_generation_events_transformation_created_idx
  on public.user_plan_level_generation_events(transformation_id, created_at desc);

alter table public.user_plan_level_generation_events enable row level security;

drop policy if exists user_plan_level_generation_events_select_own on public.user_plan_level_generation_events;
create policy user_plan_level_generation_events_select_own
  on public.user_plan_level_generation_events
  for select
  using (auth.uid() = user_id);

drop policy if exists user_plan_level_generation_events_insert_own on public.user_plan_level_generation_events;
create policy user_plan_level_generation_events_insert_own
  on public.user_plan_level_generation_events
  for insert
  with check (auth.uid() = user_id);

grant all on table public.user_plan_level_generation_events to authenticated;
grant all on table public.user_plan_level_generation_events to service_role;

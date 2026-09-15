create table if not exists public.user_professional_support_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid not null references public.user_plans_v2(id) on delete cascade,
  professional_key text not null check (
    professional_key in (
      'general_practitioner',
      'sports_physician',
      'dietitian',
      'nutrition_physician',
      'endocrinologist',
      'cardiologist',
      'gastroenterologist',
      'sleep_specialist',
      'ent_specialist',
      'urologist',
      'andrologist',
      'gynecologist',
      'midwife',
      'fertility_specialist',
      'sexologist',
      'physiotherapist',
      'pelvic_floor_physio',
      'pain_specialist',
      'psychologist',
      'psychotherapist',
      'psychiatrist',
      'cbt_therapist',
      'neuropsychologist',
      'addiction_specialist',
      'smoking_cessation_specialist',
      'couples_therapist',
      'relationship_counselor',
      'family_mediator',
      'sports_coach',
      'strength_conditioning_coach',
      'yoga_pilates_teacher',
      'occupational_therapist',
      'adhd_coach',
      'career_coach',
      'work_psychologist',
      'executive_coach',
      'speech_coach',
      'budget_counselor',
      'debt_advisor',
      'social_worker',
      'lawyer',
      'notary'
    )
  ),
  priority_rank integer not null check (priority_rank between 1 and 3),
  recommendation_level text not null check (recommendation_level in ('optional', 'recommended')),
  summary text null,
  reason text not null,
  timing_kind text not null check (
    timing_kind in ('now', 'after_phase1', 'during_target_level', 'before_next_level', 'if_blocked')
  ),
  target_phase_id text null,
  target_level_order integer null check (target_level_order is null or target_level_order >= 1),
  timing_reason text not null,
  status text not null default 'pending' check (status in ('pending', 'not_needed', 'booked', 'completed')),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transformation_id, professional_key)
);

create index if not exists user_professional_support_recommendations_active_idx
  on public.user_professional_support_recommendations(transformation_id, is_active, priority_rank);

create index if not exists user_professional_support_recommendations_plan_idx
  on public.user_professional_support_recommendations(plan_id, updated_at desc);

alter table public.user_professional_support_recommendations enable row level security;

drop policy if exists user_professional_support_recommendations_select_own on public.user_professional_support_recommendations;
create policy user_professional_support_recommendations_select_own
  on public.user_professional_support_recommendations
  for select
  using (auth.uid() = user_id);

drop policy if exists user_professional_support_recommendations_insert_own on public.user_professional_support_recommendations;
create policy user_professional_support_recommendations_insert_own
  on public.user_professional_support_recommendations
  for insert
  with check (auth.uid() = user_id);

drop policy if exists user_professional_support_recommendations_update_own on public.user_professional_support_recommendations;
create policy user_professional_support_recommendations_update_own
  on public.user_professional_support_recommendations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on table public.user_professional_support_recommendations to authenticated;
grant all on table public.user_professional_support_recommendations to service_role;

create table if not exists public.user_professional_support_events (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.user_professional_support_recommendations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid not null references public.user_plans_v2(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'generated',
      'dismissed_not_needed',
      'marked_booked',
      'marked_completed',
      'retimed_after_plan_change'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_professional_support_events_recommendation_idx
  on public.user_professional_support_events(recommendation_id, created_at desc);

create index if not exists user_professional_support_events_transformation_idx
  on public.user_professional_support_events(transformation_id, created_at desc);

alter table public.user_professional_support_events enable row level security;

drop policy if exists user_professional_support_events_select_own on public.user_professional_support_events;
create policy user_professional_support_events_select_own
  on public.user_professional_support_events
  for select
  using (auth.uid() = user_id);

drop policy if exists user_professional_support_events_insert_own on public.user_professional_support_events;
create policy user_professional_support_events_insert_own
  on public.user_professional_support_events
  for insert
  with check (auth.uid() = user_id);

grant all on table public.user_professional_support_events to authenticated;
grant all on table public.user_professional_support_events to service_role;

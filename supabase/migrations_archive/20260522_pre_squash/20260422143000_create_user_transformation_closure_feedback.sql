create table if not exists public.user_transformation_closure_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid null references public.user_plans_v2(id) on delete set null,
  helpfulness_rating integer not null check (helpfulness_rating >= 1 and helpfulness_rating <= 10),
  improvement_reasons text[] not null default '{}'::text[],
  improvement_detail text null,
  most_helpful_area text not null check (
    most_helpful_area in (
      'habits',
      'one_off_actions',
      'sophia_messages',
      'plan_structure',
      'progress_tracking',
      'other'
    )
  ),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint user_transformation_closure_feedback_transformation_key unique (transformation_id)
);

create index if not exists idx_user_transformation_closure_feedback_user_id
  on public.user_transformation_closure_feedback (user_id, created_at desc);

alter table public.user_transformation_closure_feedback enable row level security;

create policy "Users can view their own transformation closure feedback"
on public.user_transformation_closure_feedback
for select
using (auth.uid() = user_id);

create policy "Users can insert their own transformation closure feedback"
on public.user_transformation_closure_feedback
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own transformation closure feedback"
on public.user_transformation_closure_feedback
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.user_plan_review_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid null references public.user_plans_v2(id) on delete set null,
  surface text not null check (surface in ('onboarding_preview', 'active_plan')),
  user_comment text not null,
  prior_thread jsonb not null default '[]'::jsonb,
  plan_snapshot jsonb not null,
  review_kind text not null check (review_kind in ('clarification', 'preference_change', 'invalidating_fact')),
  decision text not null check (decision in ('no_change', 'minor_adjustment', 'partial_replan', 'full_replan')),
  understanding text not null,
  impact text not null,
  proposed_changes jsonb not null default '[]'::jsonb,
  regeneration_feedback text null,
  clarification_question text null,
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz null
);

create index if not exists user_plan_review_requests_user_idx
  on public.user_plan_review_requests(user_id, created_at desc);

create index if not exists user_plan_review_requests_transformation_idx
  on public.user_plan_review_requests(transformation_id, created_at desc);

alter table public.user_plan_review_requests enable row level security;

drop policy if exists user_plan_review_requests_select_own on public.user_plan_review_requests;
create policy user_plan_review_requests_select_own
  on public.user_plan_review_requests
  for select
  using (auth.uid() = user_id);

drop policy if exists user_plan_review_requests_insert_own on public.user_plan_review_requests;
create policy user_plan_review_requests_insert_own
  on public.user_plan_review_requests
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_transformations t
      where t.id = transformation_id
        and exists (
          select 1
          from public.user_cycles c
          where c.id = t.cycle_id
            and c.user_id = auth.uid()
        )
    )
  );

drop policy if exists user_plan_review_requests_update_own on public.user_plan_review_requests;
create policy user_plan_review_requests_update_own
  on public.user_plan_review_requests
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on table public.user_plan_review_requests to authenticated;
grant all on table public.user_plan_review_requests to service_role;

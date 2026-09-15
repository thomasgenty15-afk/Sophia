create table if not exists public.user_rendez_vous (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid null references public.user_transformations(id) on delete set null,
  kind text not null,
  state text not null default 'draft',
  budget_class text not null,
  trigger_reason text not null,
  confidence text not null,
  scheduled_for timestamptz null,
  posture text not null,
  source_refs jsonb not null default '{}'::jsonb,
  linked_checkin_id uuid null references public.scheduled_checkins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz null,
  constraint user_rendez_vous_kind_check
    check (
      kind in (
        'pre_event_grounding',
        'post_friction_repair',
        'weekly_reset',
        'mission_preparation',
        'transition_handoff'
      )
    ),
  constraint user_rendez_vous_state_check
    check (
      state in (
        'draft',
        'scheduled',
        'delivered',
        'skipped',
        'cancelled',
        'completed'
      )
    ),
  constraint user_rendez_vous_budget_class_check
    check (budget_class in ('silent', 'light', 'notable')),
  constraint user_rendez_vous_confidence_check
    check (confidence in ('low', 'medium', 'high')),
  constraint user_rendez_vous_confidence_not_low_check
    check (confidence <> 'low'),
  constraint user_rendez_vous_posture_check
    check (posture in ('gentle', 'supportive', 'preparatory', 'repair')),
  constraint user_rendez_vous_trigger_reason_check
    check (btrim(trigger_reason) <> ''),
  constraint user_rendez_vous_scheduled_for_required_check
    check (
      state in ('draft', 'cancelled')
      or scheduled_for is not null
    )
);

create index if not exists user_rendez_vous_user_state_idx
  on public.user_rendez_vous (user_id, state);

create index if not exists user_rendez_vous_user_scheduled_for_idx
  on public.user_rendez_vous (user_id, scheduled_for)
  where scheduled_for is not null;

drop trigger if exists update_user_rendez_vous_modtime on public.user_rendez_vous;
create trigger update_user_rendez_vous_modtime
before update on public.user_rendez_vous
for each row
execute function public.update_modified_column();

alter table public.user_rendez_vous enable row level security;

drop policy if exists rls_user_rendez_vous_select_own on public.user_rendez_vous;
create policy rls_user_rendez_vous_select_own
  on public.user_rendez_vous
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_rendez_vous_insert_own on public.user_rendez_vous;
create policy rls_user_rendez_vous_insert_own
  on public.user_rendez_vous
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_rendez_vous_update_own on public.user_rendez_vous;
create policy rls_user_rendez_vous_update_own
  on public.user_rendez_vous
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_rendez_vous_delete_own on public.user_rendez_vous;
create policy rls_user_rendez_vous_delete_own
  on public.user_rendez_vous
  for delete
  to authenticated
  using (auth.uid() = user_id);

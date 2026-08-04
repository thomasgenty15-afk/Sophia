alter table public.user_recurring_reminders
  add column if not exists cycle_id uuid null references public.user_cycles(id) on delete set null,
  add column if not exists transformation_id uuid null references public.user_transformations(id) on delete set null,
  add column if not exists scope_kind text not null default 'out_of_plan',
  add column if not exists initiative_kind text not null default 'base_free',
  add column if not exists source_kind text not null default 'user_created',
  add column if not exists source_potion_session_id uuid null references public.user_potion_sessions(id) on delete set null,
  add column if not exists starts_at timestamptz null,
  add column if not exists ends_at timestamptz null,
  add column if not exists ended_reason text null,
  add column if not exists archived_at timestamptz null,
  add column if not exists initiative_metadata jsonb not null default '{}'::jsonb;

update public.user_recurring_reminders
set starts_at = coalesce(starts_at, created_at)
where starts_at is null;

alter table public.user_recurring_reminders
  drop constraint if exists user_recurring_reminders_scope_kind_check;

alter table public.user_recurring_reminders
  add constraint user_recurring_reminders_scope_kind_check
  check (scope_kind in ('transformation', 'out_of_plan'));

alter table public.user_recurring_reminders
  drop constraint if exists user_recurring_reminders_initiative_kind_check;

alter table public.user_recurring_reminders
  add constraint user_recurring_reminders_initiative_kind_check
  check (initiative_kind in ('base_free', 'plan_free', 'potion_follow_up'));

alter table public.user_recurring_reminders
  drop constraint if exists user_recurring_reminders_source_kind_check;

alter table public.user_recurring_reminders
  add constraint user_recurring_reminders_source_kind_check
  check (source_kind in ('user_created', 'potion_generated'));

alter table public.user_recurring_reminders
  drop constraint if exists user_recurring_reminders_status_check;

alter table public.user_recurring_reminders
  add constraint user_recurring_reminders_status_check
  check (status in ('active', 'inactive', 'completed', 'expired', 'archived'));

alter table public.user_recurring_reminders
  drop constraint if exists user_recurring_reminders_ended_reason_check;

alter table public.user_recurring_reminders
  add constraint user_recurring_reminders_ended_reason_check
  check (
    ended_reason is null
    or ended_reason in ('user', 'plan_completed', 'plan_stopped', 'expired')
  );

create index if not exists user_recurring_reminders_scope_idx
  on public.user_recurring_reminders (user_id, scope_kind, status, updated_at desc);

create index if not exists user_recurring_reminders_transformation_idx
  on public.user_recurring_reminders (transformation_id, initiative_kind, status, updated_at desc);

create index if not exists user_recurring_reminders_potion_source_idx
  on public.user_recurring_reminders (source_potion_session_id)
  where source_potion_session_id is not null;

alter table public.scheduled_checkins
  add column if not exists recurring_reminder_id uuid null references public.user_recurring_reminders(id) on delete set null;

create index if not exists scheduled_checkins_recurring_reminder_idx
  on public.scheduled_checkins (recurring_reminder_id, status, scheduled_for desc)
  where recurring_reminder_id is not null;

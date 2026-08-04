alter table public.user_recurring_reminders
  add column if not exists target_kind text not null default 'none',
  add column if not exists target_plan_item_id uuid null references public.user_plan_items(id) on delete set null,
  add column if not exists target_action_family_key text null,
  add column if not exists target_generated_temp_id text null,
  add column if not exists target_binding_policy text not null default 'none',
  add column if not exists target_lifecycle_policy text not null default 'independent';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_recurring_reminders_target_kind_check'
      and conrelid = 'public.user_recurring_reminders'::regclass
  ) then
    alter table public.user_recurring_reminders
      add constraint user_recurring_reminders_target_kind_check
      check (target_kind in ('none', 'transformation', 'plan_item', 'action_family'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_recurring_reminders_target_binding_policy_check'
      and conrelid = 'public.user_recurring_reminders'::regclass
  ) then
    alter table public.user_recurring_reminders
      add constraint user_recurring_reminders_target_binding_policy_check
      check (target_binding_policy in ('none', 'snapshot', 'live_action', 'live_action_family'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_recurring_reminders_target_lifecycle_policy_check'
      and conrelid = 'public.user_recurring_reminders'::regclass
  ) then
    alter table public.user_recurring_reminders
      add constraint user_recurring_reminders_target_lifecycle_policy_check
      check (target_lifecycle_policy in ('independent', 'while_target_active', 'while_family_in_current_plan'));
  end if;
end $$;

create index if not exists idx_user_recurring_reminders_target_user_status
  on public.user_recurring_reminders(user_id, target_kind, status, updated_at desc);

create index if not exists idx_user_recurring_reminders_target_plan_item
  on public.user_recurring_reminders(target_plan_item_id, status)
  where target_plan_item_id is not null;

create index if not exists idx_user_recurring_reminders_target_action_family
  on public.user_recurring_reminders(user_id, target_action_family_key, status)
  where target_action_family_key is not null;

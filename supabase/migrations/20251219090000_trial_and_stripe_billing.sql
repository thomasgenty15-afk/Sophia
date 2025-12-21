-- Trial (14d) + Stripe subscription mirror + write-access gating (soft lock).
--
-- Goals:
-- - Every user gets a 14-day trial (no card required).
-- - After trial or after subscription ends: app becomes read-only (RLS blocks writes),
--   except profile updates which remain allowed.
-- - Stripe subscription status is mirrored in DB via webhooks (no Stripe calls in RLS).

-----------------------------------------------------------------------------
-- Profiles: add trial window + Stripe customer pointer
-----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists trial_start timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists stripe_customer_id text;

-- Default trial for new rows (trigger insert does not specify these columns).
alter table public.profiles
  alter column trial_start set default now(),
  alter column trial_end set default (now() + interval '14 days');

-- Backfill existing users: grant 14 days from rollout if not set.
update public.profiles
set
  trial_start = coalesce(trial_start, now()),
  trial_end = coalesce(trial_end, now() + interval '14 days')
where trial_end is null or trial_start is null;

-----------------------------------------------------------------------------
-- Subscriptions mirror (one active record per user for V1)
-----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null, -- 'active', 'canceled', 'past_due', ...
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_current_period_end_idx on public.subscriptions (current_period_end);

-----------------------------------------------------------------------------
-- Stripe webhook idempotency table
-----------------------------------------------------------------------------
create table if not exists public.stripe_webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);

-----------------------------------------------------------------------------
-- RLS: subscriptions are readable by the owning user; writes are server-only.
-----------------------------------------------------------------------------
alter table public.subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;

drop policy if exists rls_subscriptions_select_own on public.subscriptions;
create policy rls_subscriptions_select_own
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

-- No user policies on stripe_webhook_events (server-only); keep it locked down.

-----------------------------------------------------------------------------
-- Helper: "can this user write?" (trial or active paid period)
-- SECURITY DEFINER to avoid RLS recursion in policies.
-----------------------------------------------------------------------------
create or replace function public.has_app_write_access(uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t_end timestamptz;
begin
  if uid is null then
    return false;
  end if;

  select p.trial_end into t_end
  from public.profiles p
  where p.id = uid;

  if t_end is not null and now() < t_end then
    return true;
  end if;

  if exists (
    select 1
    from public.subscriptions s
    where s.user_id = uid
      and s.status = 'active'
      and s.current_period_end is not null
      and now() < s.current_period_end
  ) then
    return true;
  end if;

  return false;
end;
$$;

-----------------------------------------------------------------------------
-- Write gating: replace permissive user CRUD policies with "read-only unless active"
--
-- Notes:
-- - We keep SELECT unchanged (users can always read their own rows).
-- - For INSERT/UPDATE/DELETE we require has_app_write_access(auth.uid()).
-- - Profiles remain updatable even when soft-locked (handled elsewhere).
-----------------------------------------------------------------------------
do $$
begin
  ---------------------------------------------------------------------------
  -- Generic user-owned tables (user_id = auth.uid())
  ---------------------------------------------------------------------------
  -- chat_messages
  execute 'drop policy if exists rls_chat_messages_insert_own on public.chat_messages';
  execute 'drop policy if exists rls_chat_messages_update_own on public.chat_messages';
  execute 'drop policy if exists rls_chat_messages_delete_own on public.chat_messages';
  execute $sql$
    create policy rls_chat_messages_insert_own
      on public.chat_messages
      for insert
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_chat_messages_update_own
      on public.chat_messages
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_chat_messages_delete_own
      on public.chat_messages
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- memories
  execute 'drop policy if exists rls_memories_insert_own on public.memories';
  execute 'drop policy if exists rls_memories_update_own on public.memories';
  execute 'drop policy if exists rls_memories_delete_own on public.memories';
  execute $sql$
    create policy rls_memories_insert_own
      on public.memories
      for insert
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_memories_update_own
      on public.memories
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_memories_delete_own
      on public.memories
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- user_week_states
  execute 'drop policy if exists rls_user_week_states_insert_own on public.user_week_states';
  execute 'drop policy if exists rls_user_week_states_update_own on public.user_week_states';
  execute 'drop policy if exists rls_user_week_states_delete_own on public.user_week_states';
  execute $sql$
    create policy rls_user_week_states_insert_own
      on public.user_week_states
      for insert
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_user_week_states_update_own
      on public.user_week_states
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_user_week_states_delete_own
      on public.user_week_states
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- user_module_state_entries
  execute 'drop policy if exists rls_user_module_state_entries_insert_own on public.user_module_state_entries';
  execute 'drop policy if exists rls_user_module_state_entries_update_own on public.user_module_state_entries';
  execute 'drop policy if exists rls_user_module_state_entries_delete_own on public.user_module_state_entries';
  execute $sql$
    create policy rls_user_module_state_entries_insert_own
      on public.user_module_state_entries
      for insert
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_user_module_state_entries_update_own
      on public.user_module_state_entries
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_user_module_state_entries_delete_own
      on public.user_module_state_entries
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- user_answers
  execute 'drop policy if exists rls_user_answers_insert_own on public.user_answers';
  execute 'drop policy if exists rls_user_answers_update_own on public.user_answers';
  execute 'drop policy if exists rls_user_answers_delete_own on public.user_answers';
  execute $sql$
    create policy rls_user_answers_insert_own
      on public.user_answers
      for insert
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_user_answers_update_own
      on public.user_answers
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_user_answers_delete_own
      on public.user_answers
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- user_round_table_entries
  execute 'drop policy if exists rls_user_round_table_entries_insert_own on public.user_round_table_entries';
  execute 'drop policy if exists rls_user_round_table_entries_update_own on public.user_round_table_entries';
  execute 'drop policy if exists rls_user_round_table_entries_delete_own on public.user_round_table_entries';
  execute $sql$
    create policy rls_user_round_table_entries_insert_own
      on public.user_round_table_entries
      for insert
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_user_round_table_entries_update_own
      on public.user_round_table_entries
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_user_round_table_entries_delete_own
      on public.user_round_table_entries
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- user_chat_states
  execute 'drop policy if exists rls_user_chat_states_insert_own on public.user_chat_states';
  execute 'drop policy if exists rls_user_chat_states_update_own on public.user_chat_states';
  execute 'drop policy if exists rls_user_chat_states_delete_own on public.user_chat_states';
  execute $sql$
    create policy rls_user_chat_states_insert_own
      on public.user_chat_states
      for insert
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_user_chat_states_update_own
      on public.user_chat_states
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;
  execute $sql$
    create policy rls_user_chat_states_delete_own
      on public.user_chat_states
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- scheduled_checkins: keep select own; updates only when active; no user insert/delete
  execute 'drop policy if exists rls_scheduled_checkins_update_own on public.scheduled_checkins';
  execute $sql$
    create policy rls_scheduled_checkins_update_own
      on public.scheduled_checkins
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  ---------------------------------------------------------------------------
  -- Relational-integrity tables (copy of existing constraints + write gating)
  ---------------------------------------------------------------------------

  -- user_plans: goal_id must belong to same user (if present)
  execute 'drop policy if exists rls_user_plans_insert_own on public.user_plans';
  execute 'drop policy if exists rls_user_plans_update_own on public.user_plans';
  execute 'drop policy if exists rls_user_plans_delete_own on public.user_plans';
  execute $sql$
    create policy rls_user_plans_insert_own
      on public.user_plans
      for insert
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and (
          goal_id is null
          or exists (
            select 1 from public.user_goals g
            where g.id = goal_id and g.user_id = auth.uid()
          )
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_plans_update_own
      on public.user_plans
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and (
          goal_id is null
          or exists (
            select 1 from public.user_goals g
            where g.id = goal_id and g.user_id = auth.uid()
          )
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_plans_delete_own
      on public.user_plans
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- user_goals: source_answers_id must belong to same user (if present)
  execute 'drop policy if exists rls_user_goals_insert_own on public.user_goals';
  execute 'drop policy if exists rls_user_goals_update_own on public.user_goals';
  execute 'drop policy if exists rls_user_goals_delete_own on public.user_goals';
  execute $sql$
    create policy rls_user_goals_insert_own
      on public.user_goals
      for insert
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and (
          source_answers_id is null
          or exists (
            select 1 from public.user_answers a
            where a.id = source_answers_id and a.user_id = auth.uid()
          )
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_goals_update_own
      on public.user_goals
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and (
          source_answers_id is null
          or exists (
            select 1 from public.user_answers a
            where a.id = source_answers_id and a.user_id = auth.uid()
          )
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_goals_delete_own
      on public.user_goals
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- user_actions: plan_id must belong to same user
  execute 'drop policy if exists rls_user_actions_insert_own on public.user_actions';
  execute 'drop policy if exists rls_user_actions_update_own on public.user_actions';
  execute 'drop policy if exists rls_user_actions_delete_own on public.user_actions';
  execute $sql$
    create policy rls_user_actions_insert_own
      on public.user_actions
      for insert
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and exists (
          select 1 from public.user_plans p
          where p.id = plan_id and p.user_id = auth.uid()
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_actions_update_own
      on public.user_actions
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and exists (
          select 1 from public.user_plans p
          where p.id = plan_id and p.user_id = auth.uid()
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_actions_delete_own
      on public.user_actions
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- user_framework_tracking: plan_id must belong to same user
  execute 'drop policy if exists rls_user_framework_tracking_insert_own on public.user_framework_tracking';
  execute 'drop policy if exists rls_user_framework_tracking_update_own on public.user_framework_tracking';
  execute 'drop policy if exists rls_user_framework_tracking_delete_own on public.user_framework_tracking';
  execute $sql$
    create policy rls_user_framework_tracking_insert_own
      on public.user_framework_tracking
      for insert
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and exists (
          select 1 from public.user_plans p
          where p.id = plan_id and p.user_id = auth.uid()
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_framework_tracking_update_own
      on public.user_framework_tracking
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and exists (
          select 1 from public.user_plans p
          where p.id = plan_id and p.user_id = auth.uid()
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_framework_tracking_delete_own
      on public.user_framework_tracking
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- user_framework_entries: plan_id nullable; if present must belong to same user
  execute 'drop policy if exists rls_user_framework_entries_insert_own on public.user_framework_entries';
  execute 'drop policy if exists rls_user_framework_entries_update_own on public.user_framework_entries';
  execute 'drop policy if exists rls_user_framework_entries_delete_own on public.user_framework_entries';
  execute $sql$
    create policy rls_user_framework_entries_insert_own
      on public.user_framework_entries
      for insert
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and (
          plan_id is null
          or exists (
            select 1 from public.user_plans p
            where p.id = plan_id and p.user_id = auth.uid()
          )
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_framework_entries_update_own
      on public.user_framework_entries
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and (
          plan_id is null
          or exists (
            select 1 from public.user_plans p
            where p.id = plan_id and p.user_id = auth.uid()
          )
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_framework_entries_delete_own
      on public.user_framework_entries
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- user_vital_signs: plan_id nullable; if present must belong to same user
  execute 'drop policy if exists rls_user_vital_signs_insert_own on public.user_vital_signs';
  execute 'drop policy if exists rls_user_vital_signs_update_own on public.user_vital_signs';
  execute 'drop policy if exists rls_user_vital_signs_delete_own on public.user_vital_signs';
  execute $sql$
    create policy rls_user_vital_signs_insert_own
      on public.user_vital_signs
      for insert
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and (
          plan_id is null
          or exists (
            select 1 from public.user_plans p
            where p.id = plan_id and p.user_id = auth.uid()
          )
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_vital_signs_update_own
      on public.user_vital_signs
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and (
          plan_id is null
          or exists (
            select 1 from public.user_plans p
            where p.id = plan_id and p.user_id = auth.uid()
          )
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_vital_signs_delete_own
      on public.user_vital_signs
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- user_vital_sign_entries: vital_sign_id must belong to same user
  execute 'drop policy if exists rls_user_vital_sign_entries_insert_own on public.user_vital_sign_entries';
  execute 'drop policy if exists rls_user_vital_sign_entries_delete_own on public.user_vital_sign_entries';
  execute $sql$
    create policy rls_user_vital_sign_entries_insert_own
      on public.user_vital_sign_entries
      for insert
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and exists (
          select 1 from public.user_vital_signs vs
          where vs.id = vital_sign_id and vs.user_id = auth.uid()
        )
      )
  $sql$;
  execute $sql$
    create policy rls_user_vital_sign_entries_delete_own
      on public.user_vital_sign_entries
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

  -- plan_feedbacks: plan_id nullable; if present must belong to same user
  execute 'drop policy if exists rls_plan_feedbacks_insert_own on public.plan_feedbacks';
  execute 'drop policy if exists rls_plan_feedbacks_update_own on public.plan_feedbacks';
  execute 'drop policy if exists rls_plan_feedbacks_delete_own on public.plan_feedbacks';
  execute $sql$
    create policy rls_plan_feedbacks_insert_own
      on public.plan_feedbacks
      for insert
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and (
          plan_id is null
          or exists (
            select 1 from public.user_plans p
            where p.id = plan_id and p.user_id = auth.uid()
          )
        )
      )
  $sql$;
  execute $sql$
    create policy rls_plan_feedbacks_update_own
      on public.plan_feedbacks
      for update
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
      with check (
        auth.uid() = user_id
        and public.has_app_write_access(auth.uid())
        and (
          plan_id is null
          or exists (
            select 1 from public.user_plans p
            where p.id = plan_id and p.user_id = auth.uid()
          )
        )
      )
  $sql$;
  execute $sql$
    create policy rls_plan_feedbacks_delete_own
      on public.plan_feedbacks
      for delete
      using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  $sql$;

end $$;



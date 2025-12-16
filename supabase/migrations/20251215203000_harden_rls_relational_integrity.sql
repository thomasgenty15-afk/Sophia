-- Harden relational integrity in RLS policies (idempotent-ish).
--
-- Problem:
-- Many tables are "user-owned" (user_id = auth.uid()) but also reference other user-owned rows
-- (plan_id, goal_id, vital_sign_id, source_answers_id). Without relational checks, a user can
-- create rows that point to IDs they don't own (data pollution / unexpected links).
--
-- Goal:
-- Replace permissive policies with stricter ones that additionally validate parent ownership.
--
-- Notes:
-- - Policies are additive, so we MUST drop old permissive policies (both legacy names and rls_* names).
-- - Service role bypasses RLS; internal jobs remain unaffected.

do $$
begin
  ---------------------------------------------------------------------------
  -- user_plans: if goal_id is present, it must belong to the same user
  ---------------------------------------------------------------------------
  execute 'drop policy if exists "Users own plans" on public.user_plans';
  execute 'drop policy if exists rls_user_plans_select_own on public.user_plans';
  execute 'drop policy if exists rls_user_plans_insert_own on public.user_plans';
  execute 'drop policy if exists rls_user_plans_update_own on public.user_plans';
  execute 'drop policy if exists rls_user_plans_delete_own on public.user_plans';

  execute $sql$
    create policy rls_user_plans_select_own
      on public.user_plans
      for select
      using (auth.uid() = user_id)
  $sql$;

  execute $sql$
    create policy rls_user_plans_insert_own
      on public.user_plans
      for insert
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
  $sql$;

  ---------------------------------------------------------------------------
  -- user_goals: if source_answers_id is present, it must belong to same user
  ---------------------------------------------------------------------------
  execute 'drop policy if exists "Users own goals" on public.user_goals';
  execute 'drop policy if exists rls_user_goals_select_own on public.user_goals';
  execute 'drop policy if exists rls_user_goals_insert_own on public.user_goals';
  execute 'drop policy if exists rls_user_goals_update_own on public.user_goals';
  execute 'drop policy if exists rls_user_goals_delete_own on public.user_goals';

  execute $sql$
    create policy rls_user_goals_select_own
      on public.user_goals
      for select
      using (auth.uid() = user_id)
  $sql$;

  execute $sql$
    create policy rls_user_goals_insert_own
      on public.user_goals
      for insert
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
  $sql$;

  ---------------------------------------------------------------------------
  -- user_actions: plan_id must belong to same user
  ---------------------------------------------------------------------------
  execute 'drop policy if exists "Users can view their own actions" on public.user_actions';
  execute 'drop policy if exists "Users can insert their own actions" on public.user_actions';
  execute 'drop policy if exists "Users can update their own actions" on public.user_actions';
  execute 'drop policy if exists "Users can delete their own actions" on public.user_actions';
  execute 'drop policy if exists rls_user_actions_select_own on public.user_actions';
  execute 'drop policy if exists rls_user_actions_insert_own on public.user_actions';
  execute 'drop policy if exists rls_user_actions_update_own on public.user_actions';
  execute 'drop policy if exists rls_user_actions_delete_own on public.user_actions';

  execute $sql$
    create policy rls_user_actions_select_own
      on public.user_actions
      for select
      using (auth.uid() = user_id)
  $sql$;

  execute $sql$
    create policy rls_user_actions_insert_own
      on public.user_actions
      for insert
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
  $sql$;

  ---------------------------------------------------------------------------
  -- user_framework_tracking: plan_id must belong to same user
  ---------------------------------------------------------------------------
  execute 'drop policy if exists "Users can view their own framework tracking" on public.user_framework_tracking';
  execute 'drop policy if exists "Users can insert their own framework tracking" on public.user_framework_tracking';
  execute 'drop policy if exists "Users can update their own framework tracking" on public.user_framework_tracking';
  execute 'drop policy if exists "Users can delete their own framework tracking" on public.user_framework_tracking';
  execute 'drop policy if exists rls_user_framework_tracking_select_own on public.user_framework_tracking';
  execute 'drop policy if exists rls_user_framework_tracking_insert_own on public.user_framework_tracking';
  execute 'drop policy if exists rls_user_framework_tracking_update_own on public.user_framework_tracking';
  execute 'drop policy if exists rls_user_framework_tracking_delete_own on public.user_framework_tracking';

  execute $sql$
    create policy rls_user_framework_tracking_select_own
      on public.user_framework_tracking
      for select
      using (auth.uid() = user_id)
  $sql$;

  execute $sql$
    create policy rls_user_framework_tracking_insert_own
      on public.user_framework_tracking
      for insert
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
  $sql$;

  ---------------------------------------------------------------------------
  -- user_framework_entries: plan_id is nullable; if present must belong to same user
  ---------------------------------------------------------------------------
  execute 'drop policy if exists "Users can view their own framework entries" on public.user_framework_entries';
  execute 'drop policy if exists "Users can insert their own framework entries" on public.user_framework_entries';
  execute 'drop policy if exists "Users can update their own framework entries" on public.user_framework_entries';
  execute 'drop policy if exists "Users can delete their own framework entries" on public.user_framework_entries';
  execute 'drop policy if exists rls_user_framework_entries_select_own on public.user_framework_entries';
  execute 'drop policy if exists rls_user_framework_entries_insert_own on public.user_framework_entries';
  execute 'drop policy if exists rls_user_framework_entries_update_own on public.user_framework_entries';
  execute 'drop policy if exists rls_user_framework_entries_delete_own on public.user_framework_entries';

  execute $sql$
    create policy rls_user_framework_entries_select_own
      on public.user_framework_entries
      for select
      using (auth.uid() = user_id)
  $sql$;

  execute $sql$
    create policy rls_user_framework_entries_insert_own
      on public.user_framework_entries
      for insert
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
  $sql$;

  ---------------------------------------------------------------------------
  -- user_vital_signs: plan_id is nullable; if present must belong to same user
  ---------------------------------------------------------------------------
  execute 'drop policy if exists "Users can view their own vital signs" on public.user_vital_signs';
  execute 'drop policy if exists "Users can insert their own vital signs" on public.user_vital_signs';
  execute 'drop policy if exists "Users can update their own vital signs" on public.user_vital_signs';
  execute 'drop policy if exists "Users can delete their own vital signs" on public.user_vital_signs';
  execute 'drop policy if exists rls_user_vital_signs_select_own on public.user_vital_signs';
  execute 'drop policy if exists rls_user_vital_signs_insert_own on public.user_vital_signs';
  execute 'drop policy if exists rls_user_vital_signs_update_own on public.user_vital_signs';
  execute 'drop policy if exists rls_user_vital_signs_delete_own on public.user_vital_signs';

  execute $sql$
    create policy rls_user_vital_signs_select_own
      on public.user_vital_signs
      for select
      using (auth.uid() = user_id)
  $sql$;

  execute $sql$
    create policy rls_user_vital_signs_insert_own
      on public.user_vital_signs
      for insert
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
  $sql$;

  ---------------------------------------------------------------------------
  -- user_vital_sign_entries: vital_sign_id must belong to same user
  ---------------------------------------------------------------------------
  execute 'drop policy if exists "Users can view their own vital sign entries" on public.user_vital_sign_entries';
  execute 'drop policy if exists "Users can insert their own vital sign entries" on public.user_vital_sign_entries';
  execute 'drop policy if exists "Users can delete their own vital sign entries" on public.user_vital_sign_entries';
  execute 'drop policy if exists rls_user_vital_sign_entries_select_own on public.user_vital_sign_entries';
  execute 'drop policy if exists rls_user_vital_sign_entries_insert_own on public.user_vital_sign_entries';
  execute 'drop policy if exists rls_user_vital_sign_entries_update_own on public.user_vital_sign_entries';
  execute 'drop policy if exists rls_user_vital_sign_entries_delete_own on public.user_vital_sign_entries';

  execute $sql$
    create policy rls_user_vital_sign_entries_select_own
      on public.user_vital_sign_entries
      for select
      using (auth.uid() = user_id)
  $sql$;

  execute $sql$
    create policy rls_user_vital_sign_entries_insert_own
      on public.user_vital_sign_entries
      for insert
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
  $sql$;

  ---------------------------------------------------------------------------
  -- plan_feedbacks: if plan_id is present, it must belong to same user
  ---------------------------------------------------------------------------
  execute 'drop policy if exists "Users own feedbacks" on public.plan_feedbacks';
  execute 'drop policy if exists rls_plan_feedbacks_select_own on public.plan_feedbacks';
  execute 'drop policy if exists rls_plan_feedbacks_insert_own on public.plan_feedbacks';
  execute 'drop policy if exists rls_plan_feedbacks_update_own on public.plan_feedbacks';
  execute 'drop policy if exists rls_plan_feedbacks_delete_own on public.plan_feedbacks';

  execute $sql$
    create policy rls_plan_feedbacks_select_own
      on public.plan_feedbacks
      for select
      using (auth.uid() = user_id)
  $sql$;

  execute $sql$
    create policy rls_plan_feedbacks_insert_own
      on public.plan_feedbacks
      for insert
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
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
      using (auth.uid() = user_id)
  $sql$;

  ---------------------------------------------------------------------------
  -- scheduled_checkins: do NOT allow end-users to insert/delete (cost/spam).
  -- Keep select own; allow update own if you want UI to cancel checkins.
  ---------------------------------------------------------------------------
  execute 'drop policy if exists rls_scheduled_checkins_insert_own on public.scheduled_checkins';
  execute 'drop policy if exists rls_scheduled_checkins_delete_own on public.scheduled_checkins';
end $$;



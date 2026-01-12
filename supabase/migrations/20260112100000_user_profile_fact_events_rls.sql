-- Add missing self policies for user_profile_fact_events (update/delete)

do $$
begin
  execute '' ||
    'create policy rls_user_profile_fact_events_update_self on public.user_profile_fact_events ' ||
    'for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy rls_user_profile_fact_events_delete_self on public.user_profile_fact_events for delete using (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;

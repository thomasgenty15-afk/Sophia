create table if not exists public.user_relation_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_contact_windows text[] null,
  disliked_contact_windows text[] null,
  preferred_tone text null,
  preferred_message_length text null,
  max_proactive_intensity text null,
  soft_no_contact_rules jsonb null,
  updated_at timestamptz not null default now(),
  constraint user_relation_preferences_preferred_tone_check
    check (preferred_tone in ('gentle', 'direct', 'mixed') or preferred_tone is null),
  constraint user_relation_preferences_preferred_message_length_check
    check (
      preferred_message_length in ('short', 'medium') or
      preferred_message_length is null
    ),
  constraint user_relation_preferences_max_proactive_intensity_check
    check (
      max_proactive_intensity in ('low', 'medium', 'high') or
      max_proactive_intensity is null
    )
);

alter table public.user_relation_preferences enable row level security;

drop policy if exists rls_user_relation_preferences_select_own on public.user_relation_preferences;
create policy rls_user_relation_preferences_select_own
  on public.user_relation_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_relation_preferences_insert_own on public.user_relation_preferences;
create policy rls_user_relation_preferences_insert_own
  on public.user_relation_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_relation_preferences_update_own on public.user_relation_preferences;
create policy rls_user_relation_preferences_update_own
  on public.user_relation_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_relation_preferences_delete_own on public.user_relation_preferences;
create policy rls_user_relation_preferences_delete_own
  on public.user_relation_preferences
  for delete
  to authenticated
  using (auth.uid() = user_id);

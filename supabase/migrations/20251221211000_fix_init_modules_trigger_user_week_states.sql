-- Fix staging signup 500:
-- The trigger `on_profile_created_init_modules` calls `public.initialize_user_modules()`.
-- Some environments still had the legacy table `public.user_module_states`, but the current schema uses `public.user_week_states`.
-- If `user_module_states` doesn't exist, the trigger crashes profile creation and Auth signup returns 500.

create or replace function public.initialize_user_modules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Insert ONLY the first module/week state for a new user.
  insert into public.user_week_states (user_id, module_id, status, available_at)
  values (new.id, 'week_1', 'available', now())
  on conflict (user_id, module_id) do nothing;

  return new;
end;
$$;




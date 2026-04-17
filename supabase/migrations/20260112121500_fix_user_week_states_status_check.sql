-- Fix inconsistent environments where `public.user_week_states.status` rejects 'available'.
-- The app (frontend + tests + triggers) uses status in ('available', 'completed').
-- Some DBs ended up with an older constraint definition under the same name.

do $$
begin
  -- Drop the legacy/misconfigured check constraint if present.
  execute 'alter table public.user_week_states drop constraint if exists user_module_states_status_check';

  -- Drop a newer name too, if it exists from a previous manual fix.
  execute 'alter table public.user_week_states drop constraint if exists user_week_states_status_check';

  -- Recreate with the correct allowed values.
  -- Note: some environments historically used 'active' (started) as a status.
  -- We allow it to keep backward compatibility while the frontend migrates fully to 'available' + timestamps.
  execute $sql$
    alter table public.user_week_states
      add constraint user_week_states_status_check
      check (status in ('available', 'active', 'completed'))
  $sql$;
end $$;



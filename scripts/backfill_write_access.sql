-- Utilities to debug & unblock writes in environments using the "trial/write gate".
-- Run in Supabase SQL editor (or `psql`) as an admin role.
--
-- WARNING:
-- - Setting `disable_write_gate = true` removes the read-only lock for everyone.
-- - Extending trials affects all users.

-- 1) Quick health: how many users can currently write?
select
  count(*) as total_profiles,
  count(*) filter (where public.has_app_write_access(id)) as can_write_profiles,
  count(*) filter (where not public.has_app_write_access(id)) as soft_locked_profiles
from public.profiles;

-- 2) DEV/LOCAL: disable write gate globally (recommended for local development)
insert into public.app_config (key, value)
values ('disable_write_gate', 'true')
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

-- 3) Alternative: extend everyone’s trial by 365 days (useful for staging/demo)
-- update public.profiles
-- set trial_end = greatest(coalesce(trial_end, now()), now()) + interval '365 days';




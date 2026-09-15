-- Align write-gate logic with profiles.access_tier recomputation.
-- A subscription with status active/trialing and a null current_period_end
-- is treated as active elsewhere in the codebase, so writes should follow
-- the same rule to avoid false read-only behavior.

create or replace function public.has_app_write_access(uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t_end timestamptz;
  disable_gate boolean := false;
begin
  if uid is null then
    return false;
  end if;

  if exists (
    select 1
    from public.internal_admins ia
    where ia.user_id = uid
  ) then
    return true;
  end if;

  begin
    select
      case
        when lower(trim(c.value)) in ('1','true','t','yes','y','on') then true
        else false
      end
    into disable_gate
    from public.app_config c
    where c.key = 'disable_write_gate'
    limit 1;
  exception when others then
    disable_gate := false;
  end;

  if disable_gate then
    return true;
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
      and lower(coalesce(s.status, '')) in ('active', 'trialing')
      and (s.current_period_end is null or now() < s.current_period_end)
  ) then
    return true;
  end if;

  return false;
end;
$$;

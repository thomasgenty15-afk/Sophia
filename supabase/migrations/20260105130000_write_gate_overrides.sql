-- Write-gate overrides (idempotent).
--
-- Context:
-- `public.has_app_write_access(uid)` is used by RLS policies to soft-lock the app
-- (read-only) when trial is expired and there's no active subscription.
--
-- This migration adds two pragmatic escape hatches:
-- - internal admins can always write
-- - optional per-environment override via `public.app_config` key `disable_write_gate`

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

  -- 1) Internal admins can always write.
  if exists (
    select 1
    from public.internal_admins ia
    where ia.user_id = uid
  ) then
    return true;
  end if;

  -- 2) Optional environment override (useful for local/staging).
  -- Set: insert into public.app_config(key,value) values ('disable_write_gate','true');
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

  -- 3) Trial window
  select p.trial_end into t_end
  from public.profiles p
  where p.id = uid;

  if t_end is not null and now() < t_end then
    return true;
  end if;

  -- 4) Paid access (mirrored via Stripe webhooks)
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




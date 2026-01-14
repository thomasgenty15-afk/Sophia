-- Single source of truth for "plan" displayed in the app:
-- Store computed access tier on profiles, and update it automatically whenever subscriptions change.
--
-- access_tier values:
--   - 'none'        : no active trial and no active subscription
--   - 'trial'       : trial active (no active paid subscription)
--   - 'system'      : paid System active
--   - 'alliance'    : paid Alliance active
--   - 'architecte'  : paid Architecte active
--
-- We also add `subscriptions.tier` so Postgres can compute deterministically without knowing Stripe price IDs.

-- 1) Schema: add profile access tier + subscription tier
alter table public.profiles
  add column if not exists access_tier text not null default 'none';

do $$
begin
  -- Normalize constraint (idempotent)
  execute 'alter table public.profiles drop constraint if exists profiles_access_tier_check';
  execute $sql$
    alter table public.profiles
      add constraint profiles_access_tier_check
      check (access_tier in ('none','trial','system','alliance','architecte'))
  $sql$;
end $$;

alter table public.subscriptions
  add column if not exists tier text;

do $$
begin
  execute 'alter table public.subscriptions drop constraint if exists subscriptions_tier_check';
  execute $sql$
    alter table public.subscriptions
      add constraint subscriptions_tier_check
      check (tier is null or tier in ('system','alliance','architecte'))
  $sql$;
end $$;

-- 2) Helper: recompute access tier for one user
create or replace function public.recompute_profile_access_tier(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t_end timestamptz;
  sub_status text;
  sub_end timestamptz;
  sub_tier text;
  sub_active boolean;
  next_tier text;
begin
  if uid is null then
    return;
  end if;

  select p.trial_end into t_end
  from public.profiles p
  where p.id = uid;

  select s.status, s.current_period_end, s.tier
    into sub_status, sub_end, sub_tier
  from public.subscriptions s
  where s.user_id = uid;

  sub_active :=
    (lower(coalesce(sub_status,'')) in ('active','trialing'))
    and (sub_end is null or now() < sub_end);

  if sub_active and sub_tier is not null and sub_tier in ('system','alliance','architecte') then
    next_tier := sub_tier;
  elsif t_end is not null and now() < t_end then
    next_tier := 'trial';
  else
    next_tier := 'none';
  end if;

  update public.profiles
  set access_tier = next_tier
  where id = uid;
end;
$$;

-- 3) Triggers: keep profiles.access_tier in sync
-- Trigger function wrapper (so we can handle INSERT/UPDATE/DELETE)
create or replace function public._trg_recompute_profile_access_tier_from_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_profile_access_tier(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists on_subscriptions_change_recompute_access on public.subscriptions;
drop trigger if exists on_subscriptions_change_recompute_access_delete on public.subscriptions;

-- INSERT/UPDATE trigger (only when relevant columns change)
create trigger on_subscriptions_change_recompute_access
after insert or update of status, current_period_end, tier
on public.subscriptions
for each row
execute function public._trg_recompute_profile_access_tier_from_subscriptions();

-- DELETE trigger
create trigger on_subscriptions_change_recompute_access_delete
after delete
on public.subscriptions
for each row
execute function public._trg_recompute_profile_access_tier_from_subscriptions();

-- When trial_end changes (or on insert), recompute too.
create or replace function public._trg_recompute_profile_access_tier_from_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_profile_access_tier(new.id);
  return new;
end;
$$;

drop trigger if exists on_profiles_trial_change_recompute_access on public.profiles;
create trigger on_profiles_trial_change_recompute_access
after insert or update of trial_end
on public.profiles
for each row
execute function public._trg_recompute_profile_access_tier_from_profiles();

-- 4) Backfill existing rows
do $$
declare
  r record;
begin
  for r in (select id from public.profiles) loop
    perform public.recompute_profile_access_tier(r.id);
  end loop;
end $$;



-- Safety net: allow an authenticated user to trigger recompute of their own access tier.
-- This helps when time passes (current_period_end) but a webhook is delayed/missed.

create or replace function public.recompute_my_access_tier()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  tier text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Unauthorized';
  end if;

  perform public.recompute_profile_access_tier(uid);

  select p.access_tier into tier
  from public.profiles p
  where p.id = uid;

  return coalesce(tier, 'none');
end;
$$;




create extension if not exists "pg_cron" with schema "extensions";

create or replace function public.recompute_time_based_access_tiers(
  p_limit int default 5000
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  processed int := 0;
  capped_limit int := greatest(1, least(coalesce(p_limit, 5000), 50000));
begin
  for r in
    select p.id
    from public.profiles p
    where p.access_tier <> 'none'
    order by p.id
    limit capped_limit
  loop
    perform public.recompute_profile_access_tier(r.id);
    processed := processed + 1;
  end loop;

  return processed;
end;
$$;

do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'recompute-time-based-access-tiers'
  limit 1;

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'recompute-time-based-access-tiers',
  '15 3 * * *',
  $$select public.recompute_time_based_access_tiers();$$
);

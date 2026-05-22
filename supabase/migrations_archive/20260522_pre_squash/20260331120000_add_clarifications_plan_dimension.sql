do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'plan_dimension'
      and n.nspname = 'public'
      and e.enumlabel = 'clarifications'
  ) then
    alter type public.plan_dimension add value 'clarifications';
  end if;
end
$$;

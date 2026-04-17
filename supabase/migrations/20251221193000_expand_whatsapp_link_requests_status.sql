-- Expand WhatsApp link request status values to support a 2-step "email not found" flow
-- and a "support required" terminal state.
--
-- NOTE: this migration is written to be idempotent in local dev where the original
-- CHECK constraint may already exist with the same name.

-- Drop the known constraint name if it already exists (common in Postgres auto-naming).
alter table public.whatsapp_link_requests
  drop constraint if exists whatsapp_link_requests_status_check;

-- Best-effort: also drop any other CHECK constraint on this table that validates `status in (...)`
-- (in case the constraint was created with a different name).
do $$
declare
  c_name text;
begin
  for c_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'whatsapp_link_requests'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status in%'
  loop
    execute format('alter table public.whatsapp_link_requests drop constraint %I', c_name);
  end loop;

  -- Recreate with the expanded enum-like list
  alter table public.whatsapp_link_requests
    add constraint whatsapp_link_requests_status_check
    check (status in ('pending', 'linked', 'blocked', 'confirm_email', 'support_required'));
end $$;



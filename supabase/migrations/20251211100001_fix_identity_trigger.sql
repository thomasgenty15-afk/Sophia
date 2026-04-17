-- Fix Identity Trigger with Robust pg_net call
-- (Replaces previous triggers)

-- 1. Ensure Extension
create extension if not exists "pg_net" with schema "extensions";

-- 2. Drop Old Objects to be clean
drop trigger if exists "on_week_completed_identity" on "public"."user_week_states";
drop trigger if exists "on_module_updated_identity" on "public"."user_module_state_entries";
drop function if exists public.handle_core_identity_trigger();

-- 3. Re-Create the Function
create or replace function public.handle_core_identity_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  -- Local Docker URL. change to project URL in production.
  url text := 'http://host.docker.internal:54321/functions/v1/update-core-identity';
begin
  raise notice 'Trigger handle_core_identity_trigger fired for % ID %', TG_TABLE_NAME, new.id;

  perform
    net.http_post(
      url := url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Supabase-Event-Type', 'webhook'
      ),
      body := jsonb_build_object(
        'type', TG_OP, 
        'table', TG_TABLE_NAME, 
        'record', row_to_json(new),
        'old_record', row_to_json(old)
      )
    );
  return new;
end;
$$;

-- 4. Re-Create Trigger 1 : Week Completed
create trigger "on_week_completed_identity"
after update on "public"."user_week_states"
for each row
when (
  (new.status = 'completed') 
  AND (old.status IS DISTINCT FROM new.status)
)
execute function public.handle_core_identity_trigger();

-- 5. Re-Create Trigger 2 : Module Updated (Forge)
create trigger "on_module_updated_identity"
after update on "public"."user_module_state_entries"
for each row
when (
  (new.content IS DISTINCT FROM old.content)
  AND (length(new.content::text) > 10)
)
execute function public.handle_core_identity_trigger();


-- 1. Enable pg_net extension
create extension if not exists "pg_net" with schema "extensions";

-- 2. Create the Trigger Function
create or replace function public.handle_core_identity_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  -- URL for local development. 
  -- IMPORTANT: When deploying to production, this URL MUST be updated via a migration
  -- or by creating the webhook in the dashboard.
  -- In local Docker, 'host.docker.internal' points to the host machine where functions run.
  url text := 'http://host.docker.internal:54321/functions/v1/update-core-identity';
  
  -- Service Key Check
  -- If you are getting 401 Unauthorized in logs, it's because the function needs the Authorization header.
  -- In local dev, we can try to skip auth check in the function, OR inject the key.
  -- Ideally, the function should allow Service Role access.
begin
  -- Debug log to see if trigger fires
  raise notice 'Trigger handle_core_identity_trigger fired for %', TG_TABLE_NAME;

  perform
    net.http_post(
      url := url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- Try to pass the anon key if service key is hard to get, 
        -- assuming the function logic handles security or is internal only.
        -- BUT: The best way is to not check auth in the function if called internally in dev,
        -- or use a fixed header.
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

-- 3. Trigger 1 : Week Completed
drop trigger if exists "on_week_completed_identity" on "public"."user_week_states";
create trigger "on_week_completed_identity"
after update on "public"."user_week_states"
for each row
when (
  (new.status = 'completed') 
  AND (old.status IS DISTINCT FROM new.status)
)
execute function public.handle_core_identity_trigger();

-- 4. Trigger 2 : Module Updated
drop trigger if exists "on_module_updated_identity" on "public"."user_module_state_entries";
create trigger "on_module_updated_identity"
after update on "public"."user_module_state_entries"
for each row
when (
  (new.content IS DISTINCT FROM old.content)
  AND (length(new.content::text) > 10)
)
execute function public.handle_core_identity_trigger();

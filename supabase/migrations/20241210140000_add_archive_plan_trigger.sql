
-- 1. Enable pg_net extension if not already enabled
create extension if not exists "pg_net" with schema "extensions";

-- 2. Create the Trigger Function that calls the Edge Function
create or replace function public.handle_archive_plan_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  -- URL of the Edge Function.
  -- In production (Supabase hosted), this is usually: https://<project_ref>.supabase.co/functions/v1/archive-plan
  -- Since we are in a migration file, we can't easily inject the project ID dynamically.
  -- SOLUTION: We use a session variable OR a well-known placeholder that you can search/replace.
  -- Alternatively, for local dev with Docker, it's http://host.docker.internal:54321/functions/v1/archive-plan
  
  -- NOTE: Please REPLACE THIS URL with your actual Edge Function URL.
  -- If using local Supabase: http://host.docker.internal:54321/functions/v1/archive-plan
  -- If using Production: https://[PROJECT_ID].supabase.co/functions/v1/archive-plan
  
  -- For now, I will use a generic placeholder that works if you set the secrets, or fail safely.
  url text := 'http://host.docker.internal:54321/functions/v1/archive-plan'; 
  
  -- Service Key is needed for the function to trust the caller.
  -- SECURITY WARNING: Hardcoding keys in migrations is bad practice.
  -- Ideally, read from vault.decrypted_secrets if available, or assume function allows anon with payload check.
  -- Here we will send a custom header that the function can verify, or rely on network security.
  -- For this example, we assume the function checks the payload structure.
  
begin
  -- Call the function asynchronously
  perform
    net.http_post(
      url := url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'type', 'UPDATE',
        'table', 'user_plans',
        'record', row_to_json(new),
        'old_record', row_to_json(old)
      )
    );
  
  return new;
end;
$$;

-- 3. Create the Trigger on user_plans table
create or replace trigger "on_plan_completed_archive"
after update on "public"."user_plans"
for each row
when (
  (new.status = 'completed' OR new.status = 'archived') 
  AND (old.status IS DISTINCT FROM new.status)
)
execute function public.handle_archive_plan_trigger();


-- Trigger for Micro-Memory Creation (Forge)
-- Ensures every module update generates a memory, regardless of frontend calls.

create extension if not exists "pg_net" with schema "extensions";

create or replace function public.handle_module_memory_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  -- Local Docker URL. Update for production.
  url text := 'http://host.docker.internal:54321/functions/v1/create-module-memory';
begin
  -- Debug
  -- raise notice 'Memory Trigger fired for %', new.module_id;

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

-- Create Trigger
drop trigger if exists "on_module_updated_memory" on "public"."user_module_state_entries";

create trigger "on_module_updated_memory"
after update on "public"."user_module_state_entries"
for each row
when (
  (new.content IS DISTINCT FROM old.content)
  AND (length(new.content::text) > 10)
  -- Exclude round_table modules if handled elsewhere, but safe to keep as backup
)
execute function public.handle_module_memory_trigger();


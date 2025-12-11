-- Trigger for Round Table Summary
-- Ensures every weekly review generates a memory

create extension if not exists "pg_net" with schema "extensions";

create or replace function public.handle_round_table_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  -- Local Docker URL. Update for production.
  url text := 'http://host.docker.internal:54321/functions/v1/create-round-table-summary';
begin
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
drop trigger if exists "on_round_table_saved" on "public"."user_round_table_entries";

create trigger "on_round_table_saved"
after insert or update on "public"."user_round_table_entries"
for each row
execute function public.handle_round_table_trigger();


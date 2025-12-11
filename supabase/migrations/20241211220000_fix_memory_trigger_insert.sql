-- Fix Memory Trigger to handle INSERTs and UPDATES correctly
-- (Separating triggers to avoid "cannot reference OLD" error)

drop trigger if exists "on_module_updated_memory" on "public"."user_module_state_entries";

-- 1. Trigger for INSERT (Creation)
create trigger "on_module_created_memory"
after insert on "public"."user_module_state_entries"
for each row
when (
  (length(new.content::text) > 10)
)
execute function public.handle_module_memory_trigger();

-- 2. Trigger for UPDATE (Modification)
create trigger "on_module_updated_memory"
after update on "public"."user_module_state_entries"
for each row
when (
  (new.content IS DISTINCT FROM old.content)
  AND (length(new.content::text) > 10)
)
execute function public.handle_module_memory_trigger();

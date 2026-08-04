create or replace function public.handle_user_chat_state_synthesizer_threshold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  threshold int := 15;
  old_count int := 0;
  new_count int := 0;
  safe_scope text;
begin
  old_count := coalesce(old.unprocessed_msg_count, 0);
  new_count := coalesce(new.unprocessed_msg_count, 0);
  safe_scope := coalesce(nullif(trim(new.scope), ''), 'web');

  if new.user_id is null then
    return new;
  end if;

  if (
    safe_scope = 'whatsapp' or
    safe_scope like 'module:%' or
    safe_scope like 'story:%' or
    safe_scope like 'reflection:%'
  ) then
    return new;
  end if;

  if new_count >= threshold and old_count < threshold then
    perform public.request_trigger_synthesizer_for_state(new.user_id, safe_scope);
  end if;

  return new;
end;
$$;

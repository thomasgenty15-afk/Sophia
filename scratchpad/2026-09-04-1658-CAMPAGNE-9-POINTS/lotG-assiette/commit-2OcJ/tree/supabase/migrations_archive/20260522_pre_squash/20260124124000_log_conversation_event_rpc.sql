-- Server-side event stream writer (logdrain simulation).
-- Allows Edge Functions running under user auth (no service role env) to persist structured events.

create or replace function public.log_conversation_event(
  p_eval_run_id uuid default null,
  p_request_id text default null,
  p_source text default 'unknown',
  p_event text default 'event',
  p_level text default 'info',
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_request_id is null or btrim(p_request_id) = '' then
    return;
  end if;

  insert into public.conversation_eval_events (eval_run_id, request_id, source, event, level, payload)
  values (
    p_eval_run_id,
    btrim(p_request_id),
    left(coalesce(p_source, 'unknown'), 80),
    left(coalesce(p_event, 'event'), 120),
    case when p_level in ('debug','info','warn','error') then p_level else 'info' end,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.log_conversation_event(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.log_conversation_event(uuid, text, text, text, text, jsonb) to authenticated;



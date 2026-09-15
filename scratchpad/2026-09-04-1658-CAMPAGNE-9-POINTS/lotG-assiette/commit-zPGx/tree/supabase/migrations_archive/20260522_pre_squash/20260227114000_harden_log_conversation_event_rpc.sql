-- Harden log_conversation_event RPC.
-- Goal: prevent arbitrary authenticated users from spamming internal event stream.
-- Policy:
-- - service_role: allowed
-- - authenticated: only internal admins (checked in-function)
-- Also cap payload size to keep storage abuse bounded.

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
declare
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  caller_uid uuid := auth.uid();
  safe_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  payload_size int;
begin
  if p_request_id is null or btrim(p_request_id) = '' then
    return;
  end if;

  if caller_role <> 'service_role' then
    if caller_uid is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.internal_admins ia
      where ia.user_id = caller_uid
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  payload_size := pg_column_size(safe_payload);
  if payload_size > 16384 then
    safe_payload := jsonb_build_object(
      'truncated', true,
      'reason', 'payload_too_large',
      'size_bytes', payload_size
    );
  end if;

  insert into public.conversation_eval_events (eval_run_id, request_id, source, event, level, payload)
  values (
    p_eval_run_id,
    btrim(p_request_id),
    left(coalesce(p_source, 'unknown'), 80),
    left(coalesce(p_event, 'event'), 120),
    case when p_level in ('debug','info','warn','error') then p_level else 'info' end,
    safe_payload
  );
end;
$$;

revoke all on function public.log_conversation_event(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.log_conversation_event(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.log_conversation_event(uuid, text, text, text, text, jsonb) to service_role;

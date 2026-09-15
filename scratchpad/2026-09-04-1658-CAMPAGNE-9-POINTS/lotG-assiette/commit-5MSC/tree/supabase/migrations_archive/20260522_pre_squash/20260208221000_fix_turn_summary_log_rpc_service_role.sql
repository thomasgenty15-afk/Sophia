-- Fix: WhatsApp webhook uses a service_role client (auth.uid() is NULL).
-- Allow service_role to write per-turn logs on behalf of a user, while keeping
-- strict anti-forge checks for normal authenticated user calls.

create or replace function public.log_turn_summary_log(
  p_request_id text,
  p_user_id uuid,
  p_channel text,
  p_scope text,
  p_payload jsonb,
  p_latency_total_ms int default null,
  p_latency_dispatcher_ms int default null,
  p_latency_context_ms int default null,
  p_latency_agent_ms int default null,
  p_dispatcher_model text default null,
  p_dispatcher_safety text default null,
  p_dispatcher_intent text default null,
  p_dispatcher_intent_conf real default null,
  p_dispatcher_interrupt text default null,
  p_dispatcher_topic_depth text default null,
  p_dispatcher_flow_resolution text default null,
  p_context_profile text default null,
  p_context_elements text[] default null,
  p_context_tokens int default null,
  p_target_dispatcher text default null,
  p_target_initial text default null,
  p_target_final text default null,
  p_risk_score int default null,
  p_agent_model text default null,
  p_agent_outcome text default null,
  p_agent_tool text default null,
  p_checkup_active boolean default null,
  p_toolflow_active boolean default null,
  p_supervisor_stack_top text default null,
  p_aborted boolean default false,
  p_abort_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if p_request_id is null or btrim(p_request_id) = '' then
    return;
  end if;

  if p_channel not in ('web', 'whatsapp') then
    return;
  end if;

  -- Guardrails:
  -- - For user-authenticated calls: require p_user_id == auth.uid()
  -- - For server-side contexts (WhatsApp webhook): allow service_role to specify p_user_id
  if caller_role <> 'service_role' then
    if p_user_id is null or p_user_id <> auth.uid() then
      return;
    end if;
  else
    if p_user_id is null then
      return;
    end if;
  end if;

  insert into public.turn_summary_logs (
    request_id,
    user_id,
    channel,
    scope,
    latency_total_ms,
    latency_dispatcher_ms,
    latency_context_ms,
    latency_agent_ms,
    dispatcher_model,
    dispatcher_safety,
    dispatcher_intent,
    dispatcher_intent_conf,
    dispatcher_interrupt,
    dispatcher_topic_depth,
    dispatcher_flow_resolution,
    context_profile,
    context_elements,
    context_tokens,
    target_dispatcher,
    target_initial,
    target_final,
    risk_score,
    agent_model,
    agent_outcome,
    agent_tool,
    checkup_active,
    toolflow_active,
    supervisor_stack_top,
    aborted,
    abort_reason,
    payload
  ) values (
    btrim(p_request_id),
    p_user_id,
    p_channel,
    coalesce(p_scope, 'unknown'),
    p_latency_total_ms,
    p_latency_dispatcher_ms,
    p_latency_context_ms,
    p_latency_agent_ms,
    p_dispatcher_model,
    p_dispatcher_safety,
    p_dispatcher_intent,
    p_dispatcher_intent_conf,
    p_dispatcher_interrupt,
    p_dispatcher_topic_depth,
    p_dispatcher_flow_resolution,
    p_context_profile,
    p_context_elements,
    p_context_tokens,
    p_target_dispatcher,
    p_target_initial,
    p_target_final,
    p_risk_score,
    p_agent_model,
    p_agent_outcome,
    p_agent_tool,
    p_checkup_active,
    p_toolflow_active,
    p_supervisor_stack_top,
    coalesce(p_aborted, false),
    p_abort_reason,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.log_turn_summary_log(
  text, uuid, text, text, jsonb,
  int, int, int, int,
  text, text, text, real, text, text, text,
  text, text[], int,
  text, text, text, int,
  text, text, text,
  boolean, boolean, text,
  boolean, text
) from public;
grant execute on function public.log_turn_summary_log(
  text, uuid, text, text, jsonb,
  int, int, int, int,
  text, text, text, real, text, text, text,
  text, text[], int,
  text, text, text, int,
  text, text, text,
  boolean, boolean, text,
  boolean, text
) to authenticated;
grant execute on function public.log_turn_summary_log(
  text, uuid, text, text, jsonb,
  int, int, int, int,
  text, text, text, real, text, text, text,
  text, text[], int,
  text, text, text, int,
  text, text, text,
  boolean, boolean, text,
  boolean, text
) to service_role;




create or replace function public.get_production_log(
  p_since timestamptz default (now() - interval '24 hours'),
  p_limit integer default 200,
  p_only_errors boolean default false,
  p_source text default null
)
returns table (
  ts timestamptz,
  severity text,
  source text,
  event_type text,
  title text,
  user_id uuid,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select *
  from public.get_production_log(p_since, p_limit, p_only_errors, p_source, false, null, false);
end;
$$;

create or replace function public.get_production_log(
  p_since timestamptz default (now() - interval '24 hours'),
  p_limit integer default 200,
  p_only_errors boolean default false,
  p_source text default null,
  p_include_chat boolean default false
)
returns table (
  ts timestamptz,
  severity text,
  source text,
  event_type text,
  title text,
  user_id uuid,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select *
  from public.get_production_log(p_since, p_limit, p_only_errors, p_source, p_include_chat, null, false);
end;
$$;

create or replace function public.get_production_log(
  p_since timestamptz default (now() - interval '24 hours'),
  p_limit integer default 200,
  p_only_errors boolean default false,
  p_source text default null,
  p_include_chat boolean default false,
  p_query text default null,
  p_include_runtime boolean default false
)
returns table (
  ts timestamptz,
  severity text,
  source text,
  event_type text,
  title text,
  user_id uuid,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;

  return query
  with events as (
    select
      cl.created_at as ts,
      case
        when cl.status = 'failed' then 'error'
        when cl.status in ('sent','delivered') then 'info'
        else 'warn'
      end as severity,
      cl.channel as source,
      cl.type as event_type,
      case
        when cl.status = 'failed' then 'Email failed'
        when cl.status = 'delivered' then 'Email delivered'
        else 'Email sent'
      end || ' · ' || cl.type as title,
      cl.user_id,
      jsonb_build_object(
        'status', cl.status,
        'channel', cl.channel,
        'type', cl.type,
        'metadata', cl.metadata
      ) as details
    from public.communication_logs cl
    where cl.created_at >= p_since

    union all

    select
      cm.created_at as ts,
      case
        when (cm.metadata ? 'error') or (cm.metadata ? 'exception') or (cm.metadata ? 'failed') or (cm.metadata ->> 'level') = 'error' then 'error'
        else 'info'
      end as severity,
      coalesce(cm.metadata ->> 'channel', 'web') as source,
      'chat_message' as event_type,
      'Chat · ' ||
        coalesce(cm.metadata ->> 'channel', 'web') ||
        ' · ' || cm.role::text ||
        case when cm.agent_used is not null then ' · ' || cm.agent_used::text else '' end as title,
      cm.user_id,
      jsonb_build_object(
        'id', cm.id,
        'role', cm.role,
        'agent_used', cm.agent_used,
        'content_preview', left(cm.content, 180),
        'metadata', cm.metadata
      ) as details
    from public.chat_messages cm
    where cm.created_at >= p_since

    union all

    select
      coalesce(sc.processed_at, sc.created_at) as ts,
      case
        when sc.status::text = 'failed' then 'error'
        when sc.status::text in ('cancelled','expired','awaiting_user','retrying') then 'warn'
        else 'info'
      end as severity,
      'checkins' as source,
      'scheduled_checkin' as event_type,
      'Scheduled check-in · ' || sc.status::text as title,
      sc.user_id,
      jsonb_build_object(
        'id', sc.id,
        'status', sc.status::text,
        'scheduled_for', sc.scheduled_for,
        'event_context', sc.event_context,
        'processed_at', sc.processed_at
      ) as details
    from public.scheduled_checkins sc
    where coalesce(sc.processed_at, sc.created_at) >= p_since

    union all

    select
      wpa.created_at as ts,
      case
        when wpa.status = 'expired' then 'warn'
        when wpa.status = 'cancelled' then 'warn'
        else 'info'
      end as severity,
      'whatsapp' as source,
      'whatsapp_pending_action' as event_type,
      'WhatsApp pending action · ' || wpa.kind || ' · ' || wpa.status as title,
      wpa.user_id,
      jsonb_build_object(
        'id', wpa.id,
        'kind', wpa.kind,
        'status', wpa.status,
        'scheduled_checkin_id', wpa.scheduled_checkin_id,
        'expires_at', wpa.expires_at,
        'processed_at', wpa.processed_at,
        'payload', wpa.payload
      ) as details
    from public.whatsapp_pending_actions wpa
    where wpa.created_at >= p_since

    union all

    select
      coalesce(wom.last_attempt_at, wom.updated_at, wom.created_at) as ts,
      case
        when wom.status = 'failed' then 'error'
        when wom.status in ('queued','cancelled','skipped') then 'warn'
        else 'info'
      end as severity,
      'whatsapp' as source,
      'whatsapp_outbound_message' as event_type,
      'WhatsApp outbound · ' || wom.message_type || ' · ' || wom.status as title,
      wom.user_id,
      jsonb_build_object(
        'id', wom.id,
        'request_id', wom.request_id,
        'provider_message_id', wom.provider_message_id,
        'to_e164', wom.to_e164,
        'reply_to_wamid_in', wom.reply_to_wamid_in,
        'message_type', wom.message_type,
        'content_preview', wom.content_preview,
        'status', wom.status,
        'attempt_count', wom.attempt_count,
        'max_attempts', wom.max_attempts,
        'next_retry_at', wom.next_retry_at,
        'locked_by', wom.locked_by,
        'last_error_code', wom.last_error_code,
        'last_error_message', wom.last_error_message,
        'last_error', wom.last_error,
        'metadata', wom.metadata
      ) as details
    from public.whatsapp_outbound_messages wom
    where coalesce(wom.last_attempt_at, wom.updated_at, wom.created_at) >= p_since

    union all

    select
      coalesce(wose.status_timestamp, wose.created_at) as ts,
      case
        when wose.status = 'failed' then 'error'
        when wose.status in ('sent','delivered','read') then 'info'
        else 'warn'
      end as severity,
      'whatsapp' as source,
      'whatsapp_status_event' as event_type,
      'WhatsApp status · ' || wose.status as title,
      wom.user_id,
      jsonb_build_object(
        'id', wose.id,
        'provider_message_id', wose.provider_message_id,
        'status', wose.status,
        'status_timestamp', wose.status_timestamp,
        'recipient_id', wose.recipient_id,
        'outbound_message_id', wom.id,
        'raw', wose.raw
      ) as details
    from public.whatsapp_outbound_status_events wose
    left join public.whatsapp_outbound_messages wom on wom.provider_message_id = wose.provider_message_id
    where coalesce(wose.status_timestamp, wose.created_at) >= p_since

    union all

    select
      wce.created_at as ts,
      case
        when wce.billable and wce.final_cost_eur > 0 then 'info'
        else 'warn'
      end as severity,
      'whatsapp' as source,
      'whatsapp_cost_event' as event_type,
      'WhatsApp cost · ' || coalesce(wce.template_name, wce.purpose, 'message') as title,
      wce.user_id,
      jsonb_build_object(
        'id', wce.id,
        'event_date', wce.event_date,
        'outbound_message_id', wce.outbound_message_id,
        'provider_message_id', wce.provider_message_id,
        'purpose', wce.purpose,
        'template_name', wce.template_name,
        'template_language', wce.template_language,
        'unit_cost_eur', wce.unit_cost_eur,
        'final_cost_eur', wce.final_cost_eur,
        'currency', wce.currency,
        'billable', wce.billable,
        'billing_status', wce.billing_status,
        'billed_at', wce.billed_at,
        'metadata', wce.metadata
      ) as details
    from public.whatsapp_cost_events wce
    where wce.created_at >= p_since

    union all

    select
      wid.created_at as ts,
      case
        when wid.status in ('failed','error') then 'error'
        when wid.status in ('duplicate','ignored') then 'warn'
        else 'info'
      end as severity,
      'whatsapp' as source,
      'whatsapp_inbound_dedup' as event_type,
      'WhatsApp inbound · ' || wid.status as title,
      wid.user_id,
      jsonb_build_object(
        'id', wid.id,
        'request_id', wid.request_id,
        'webhook_request_id', wid.webhook_request_id,
        'wamid_in', wid.wamid_in,
        'from_e164', wid.from_e164,
        'status', wid.status,
        'processed_at', wid.processed_at,
        'chat_message_id', wid.chat_message_id,
        'metadata', wid.metadata
      ) as details
    from public.whatsapp_inbound_dedup wid
    where wid.created_at >= p_since

    union all

    select
      wl.updated_at as ts,
      case
        when wl.status in ('blocked','support_required') then 'warn'
        else 'info'
      end as severity,
      'whatsapp' as source,
      'whatsapp_link_request' as event_type,
      'WhatsApp link request · ' || wl.status as title,
      wl.linked_user_id as user_id,
      jsonb_build_object(
        'phone_e164', wl.phone_e164,
        'status', wl.status,
        'last_prompted_at', wl.last_prompted_at,
        'attempts', wl.attempts,
        'linked_user_id', wl.linked_user_id,
        'last_email_attempt', wl.last_email_attempt,
        'created_at', wl.created_at,
        'updated_at', wl.updated_at
      ) as details
    from public.whatsapp_link_requests wl
    where wl.updated_at >= p_since

    union all

    select
      wor.updated_at as ts,
      case
        when wor.status = 'pending' then 'warn'
        when wor.status = 'cancelled' then 'warn'
        else 'info'
      end as severity,
      'whatsapp' as source,
      'whatsapp_optin_recovery' as event_type,
      'WhatsApp opt-in recovery · ' || wor.status as title,
      wor.user_id,
      jsonb_build_object(
        'user_id', wor.user_id,
        'status', wor.status,
        'provider_message_id', wor.provider_message_id,
        'error_code', wor.error_code,
        'error_message', wor.error_message,
        'first_detected_at', wor.first_detected_at,
        'email_sent_at', wor.email_sent_at,
        'resolved_at', wor.resolved_at,
        'updated_at', wor.updated_at
      ) as details
    from public.whatsapp_optin_recovery wor
    where wor.updated_at >= p_since

    union all

    select
      wui.created_at as ts,
      'warn' as severity,
      'whatsapp' as source,
      'whatsapp_unlinked_inbound' as event_type,
      'WhatsApp unlinked inbound · ' || coalesce(wui.wa_type, 'message') as title,
      null::uuid as user_id,
      jsonb_build_object(
        'id', wui.id,
        'phone_e164', wui.phone_e164,
        'wa_message_id', wui.wa_message_id,
        'wa_type', wui.wa_type,
        'text_content', wui.text_content,
        'interactive_id', wui.interactive_id,
        'interactive_title', wui.interactive_title,
        'wa_profile_name', wui.wa_profile_name,
        'raw', wui.raw
      ) as details
    from public.whatsapp_unlinked_inbound_messages wui
    where wui.created_at >= p_since

    union all

    select
      ue.created_at as ts,
      case
        when coalesce(ue.status, 'success') not in ('success','ok','completed') then 'error'
        when (ue.metadata ? 'error') or (ue.metadata ? 'exception') or (ue.metadata ? 'failed') then 'error'
        else 'info'
      end as severity,
      'llm' as source,
      'llm_usage' as event_type,
      'LLM ' || ue.kind || ' · ' || ue.model as title,
      ue.user_id,
      jsonb_build_object(
        'provider', ue.provider,
        'model', ue.model,
        'kind', ue.kind,
        'status', ue.status,
        'prompt_tokens', ue.prompt_tokens,
        'output_tokens', ue.output_tokens,
        'total_tokens', ue.total_tokens,
        'cost_usd', ue.cost_usd,
        'request_id', ue.request_id,
        'source', ue.source,
        'operation_family', ue.operation_family,
        'operation_name', ue.operation_name,
        'channel', ue.channel,
        'latency_ms', ue.latency_ms,
        'provider_request_id', ue.provider_request_id,
        'cost_unpriced', ue.cost_unpriced,
        'metadata', ue.metadata
      ) as details
    from public.llm_usage_events ue
    where ue.created_at >= p_since

    union all

    select
      lrj.updated_at as ts,
      case
        when lrj.status = 'failed' then 'error'
        when lrj.status in ('pending','processing') then 'warn'
        else 'info'
      end as severity,
      'llm' as source,
      'llm_retry_job' as event_type,
      'LLM retry · ' || lrj.status || ' · attempt ' || lrj.attempt_count::text || '/' || lrj.max_attempts::text as title,
      lrj.user_id,
      jsonb_build_object(
        'id', lrj.id,
        'scope', lrj.scope,
        'channel', lrj.channel,
        'message_preview', left(lrj.message, 180),
        'message_hash', lrj.message_hash,
        'status', lrj.status,
        'attempt_count', lrj.attempt_count,
        'max_attempts', lrj.max_attempts,
        'next_attempt_at', lrj.next_attempt_at,
        'last_attempt_at', lrj.last_attempt_at,
        'completed_at', lrj.completed_at,
        'locked_by', lrj.locked_by,
        'last_error', lrj.last_error,
        'metadata', lrj.metadata
      ) as details
    from public.llm_retry_jobs lrj
    where lrj.updated_at >= p_since

    union all

    select
      swe.received_at as ts,
      'info' as severity,
      'stripe' as source,
      'stripe_webhook' as event_type,
      'Stripe webhook received' as title,
      null::uuid as user_id,
      jsonb_build_object('event_id', swe.id) as details
    from public.stripe_webhook_events swe
    where swe.received_at >= p_since

    union all

    select
      sel.created_at as ts,
      sel.severity as severity,
      coalesce(nullif(sel.source, ''), 'edge') as source,
      case when sel.severity = 'error' then 'edge_function_error' else 'edge_function_log' end as event_type,
      coalesce(nullif(sel.title, ''), 'Edge event') || ' · ' || sel.function_name as title,
      sel.user_id,
      jsonb_build_object(
        'id', sel.id,
        'function_name', sel.function_name,
        'request_id', sel.request_id,
        'message', sel.message,
        'stack', sel.stack,
        'metadata', sel.metadata
      ) as details
    from public.system_error_logs sel
    where sel.created_at >= p_since

    union all

    select
      cae.created_at as ts,
      cae.level as severity,
      'runtime' as source,
      'runtime_' || cae.stream || '_event' as event_type,
      'Runtime · ' || cae.stream || ' · ' || cae.event as title,
      cae.user_id,
      jsonb_build_object(
        'event_id', cae.event_id,
        'request_id', cae.request_id,
        'turn_id', cae.turn_id,
        'channel', cae.channel,
        'scope', cae.scope,
        'stream', cae.stream,
        'source', cae.source,
        'level', cae.level,
        'event', cae.event,
        'phase', cae.phase,
        'payload', cae.payload
      ) as details
    from public.conversation_runtime_audit_events cae
    where p_include_runtime and cae.created_at >= p_since

    union all

    select
      tsl.created_at as ts,
      case when tsl.aborted then 'warn' else 'info' end as severity,
      'runtime' as source,
      'turn_summary' as event_type,
      'Turn summary · ' || tsl.channel || ' · ' || coalesce(tsl.dispatcher_intent, 'unknown') as title,
      tsl.user_id,
      jsonb_build_object(
        'id', tsl.id,
        'request_id', tsl.request_id,
        'channel', tsl.channel,
        'scope', tsl.scope,
        'latency_total_ms', tsl.latency_total_ms,
        'latency_dispatcher_ms', tsl.latency_dispatcher_ms,
        'latency_context_ms', tsl.latency_context_ms,
        'latency_agent_ms', tsl.latency_agent_ms,
        'dispatcher_model', tsl.dispatcher_model,
        'dispatcher_safety', tsl.dispatcher_safety,
        'dispatcher_intent', tsl.dispatcher_intent,
        'dispatcher_intent_conf', tsl.dispatcher_intent_conf,
        'dispatcher_interrupt', tsl.dispatcher_interrupt,
        'dispatcher_topic_depth', tsl.dispatcher_topic_depth,
        'dispatcher_flow_resolution', tsl.dispatcher_flow_resolution,
        'target_dispatcher', tsl.target_dispatcher,
        'target_initial', tsl.target_initial,
        'target_final', tsl.target_final,
        'risk_score', tsl.risk_score,
        'agent_model', tsl.agent_model,
        'agent_outcome', tsl.agent_outcome,
        'agent_tool', tsl.agent_tool,
        'checkup_active', tsl.checkup_active,
        'toolflow_active', tsl.toolflow_active,
        'supervisor_stack_top', tsl.supervisor_stack_top,
        'aborted', tsl.aborted,
        'abort_reason', tsl.abort_reason,
        'payload', tsl.payload
      ) as details
    from public.turn_summary_logs tsl
    where p_include_runtime and tsl.created_at >= p_since
  )
  select e.ts, e.severity, e.source, e.event_type, e.title, e.user_id, e.details
  from events e
  where
    (not p_only_errors or e.severity = 'error')
    and (p_source is null or e.source = p_source)
    and (p_include_chat or e.event_type <> 'chat_message')
    and (
      q is null
      or e.title ilike ('%' || q || '%')
      or e.event_type ilike ('%' || q || '%')
      or e.source ilike ('%' || q || '%')
      or coalesce(e.user_id::text, '') ilike ('%' || q || '%')
      or coalesce(e.details ->> 'request_id', '') ilike ('%' || q || '%')
      or e.details::text ilike ('%' || q || '%')
    )
  order by e.ts desc
  limit greatest(1, least(p_limit, 1000));
end;
$$;

grant all on function public.get_production_log(timestamptz, integer, boolean, text) to anon, authenticated, service_role;
grant all on function public.get_production_log(timestamptz, integer, boolean, text, boolean) to anon, authenticated, service_role;
grant all on function public.get_production_log(timestamptz, integer, boolean, text, boolean, text, boolean) to anon, authenticated, service_role;

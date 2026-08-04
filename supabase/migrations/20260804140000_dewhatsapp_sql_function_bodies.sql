-- DE-WHATSAPP — P5bis : LES CORPS DE FONCTIONS SQL, oubliés par l'épreuve d'absence.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- 🔴 LE DÉFAUT, ET IL ÉTAIT GRAVE
--
-- L'épreuve d'absence de P5 a grepé le code TypeScript. Elle n'a PAS grepé
-- `pg_proc.prosrc` — c'est-à-dire les corps des fonctions PL/pgSQL, qui
-- référencent des tables en TEXTE et qu'aucun compilateur ne vérifie.
--
-- Conséquence, mesurée en rejouant la semaine simulée après la démolition:
--
--     ERROR:  relation "public.whatsapp_pending_actions" does not exist
--     QUERY:  update public.whatsapp_pending_actions
--
-- La chaîne complète:
--   INSERT dans `coach_clients`
--     → trigger `on_coach_clients_change_recompute_access`
--     → met à jour `profiles.access_tier`
--     → trigger `trg_refresh_whatsapp_scheduling_on_access_tier_change`
--     → `handle_whatsapp_scheduling_access_tier_change`
--     → `cleanup_whatsapp_scheduling_for_user`
--     → `update public.whatsapp_pending_actions`  ← table renommée en P5
--
-- **Un coach ne pouvait plus ajouter un élève.** L'INSERT entier échouait, et
-- c'est le geste le plus fondamental du produit. Rien dans le TypeScript ne
-- pouvait le montrer: le renommage était correct partout où un humain avait
-- regardé.
--
-- La leçon, à retenir pour toute démolition future de ce dépôt: **renommer une
-- table demande TROIS épreuves d'absence, pas une** — le code applicatif, les
-- corps de fonctions SQL, et les vues.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1 — LES DEUX FONCTIONS VIVANTES, REPOINTÉES ────────────────────────────
-- Corps identiques à l'octet près, sauf le nom de la table. Ils sont recopiés
-- depuis `pg_get_functiondef` plutôt que réécrits: réécrire à la main une
-- logique d'annulation de rappels, c'est réintroduire un bug pour corriger un
-- renommage.

CREATE OR REPLACE FUNCTION public.cleanup_whatsapp_scheduling_for_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user_id is null then
    return;
  end if;

  update public.scheduled_checkins
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status::text in ('pending', 'retrying', 'awaiting_user')
    and scheduled_for >= now()
    and (
      event_context = 'morning_active_actions_nudge'
      or event_context like 'recurring_reminder:%'
    );

  update public.pending_actions
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and (
      (
        kind = 'scheduled_checkin'
        and (
          coalesce(payload->>'event_context', '') = 'morning_active_actions_nudge'
          or coalesce(payload->>'event_context', '') like 'recurring_reminder:%'
        )
      )
      or (
        kind = 'proactive_template_candidate'
        and coalesce(payload->>'purpose', '') = 'recurring_reminder'
      )
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.queue_whatsapp_access_ended_notification(p_user_id uuid, p_previous_access_tier text, p_new_access_tier text DEFAULT 'none'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ended_reason text;
  profile_whatsapp_opted_in boolean;
  profile_phone_invalid boolean;
  profile_phone_number text;
begin
  if p_user_id is null then
    return;
  end if;

  if lower(coalesce(p_new_access_tier, '')) <> 'none' then
    return;
  end if;

  ended_reason :=
    case
      when lower(coalesce(p_previous_access_tier, '')) = 'trial' then 'trial_ended'
      when lower(coalesce(p_previous_access_tier, '')) in ('system', 'alliance', 'architecte') then 'subscription_ended'
      else null
    end;

  if ended_reason is null then
    return;
  end if;

  select
    p.whatsapp_opted_in,
    p.phone_invalid,
    p.phone_number
  into
    profile_whatsapp_opted_in,
    profile_phone_invalid,
    profile_phone_number
  from public.profiles p
  where p.id = p_user_id
  limit 1;

  if coalesce(profile_whatsapp_opted_in, false) is not true
     or coalesce(profile_phone_invalid, false) is true
     or coalesce(profile_phone_number, '') = '' then
    return;
  end if;

  update public.pending_actions
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and kind in ('access_ended_notification', 'access_reactivation_offer');

  insert into public.pending_actions (
    user_id,
    kind,
    status,
    payload,
    expires_at
  )
  values (
    p_user_id,
    'access_ended_notification',
    'pending',
    jsonb_build_object(
      'ended_reason', ended_reason,
      'from_access_tier', lower(coalesce(p_previous_access_tier, '')),
      'to_access_tier', 'none',
      'upgrade_path', '/upgrade',
      'source', 'access_tier_transition'
    ),
    now() + interval '14 days'
  );
end;
$function$;


-- ── §1bis — `get_production_log` : cinq blocs retirés, deux repointés ────────
--
-- Cette fonction agrège le journal de production par UNION ALL sur une
-- quinzaine de sources. Cinq d'entre elles interrogeaient des tables droppées
-- en P5 — donc la fonction ENTIÈRE échouait, et l'écran admin avec elle.
--
-- Blocs retirés (leurs tables n'existent plus): `whatsapp_status_event`,
-- `whatsapp_inbound_dedup`, `whatsapp_link_request`, `whatsapp_optin_recovery`,
-- `whatsapp_unlinked_inbound`.
-- Blocs repointés: `whatsapp_pending_action` → `pending_actions`,
-- `whatsapp_outbound_message` → `outbound_messages`.
-- Bloc CONSERVÉ tel quel: `whatsapp_cost_event` — la table est gelée, pas
-- droppée, et son historique reste consultable. C'est même tout l'intérêt.

CREATE OR REPLACE FUNCTION public.get_production_log(p_since timestamp with time zone DEFAULT (now() - '24:00:00'::interval), p_limit integer DEFAULT 200, p_only_errors boolean DEFAULT false, p_source text DEFAULT NULL::text)
 RETURNS TABLE(ts timestamp with time zone, severity text, source text, event_type text, title text, user_id uuid, details jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select *
  from public.get_production_log(p_since, p_limit, p_only_errors, p_source, false, null, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_production_log(p_since timestamp with time zone DEFAULT (now() - '24:00:00'::interval), p_limit integer DEFAULT 200, p_only_errors boolean DEFAULT false, p_source text DEFAULT NULL::text, p_include_chat boolean DEFAULT false)
 RETURNS TABLE(ts timestamp with time zone, severity text, source text, event_type text, title text, user_id uuid, details jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select *
  from public.get_production_log(p_since, p_limit, p_only_errors, p_source, p_include_chat, null, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_production_log(p_since timestamp with time zone DEFAULT (now() - '24:00:00'::interval), p_limit integer DEFAULT 200, p_only_errors boolean DEFAULT false, p_source text DEFAULT NULL::text, p_include_chat boolean DEFAULT false, p_query text DEFAULT NULL::text, p_include_runtime boolean DEFAULT false)
 RETURNS TABLE(ts timestamp with time zone, severity text, source text, event_type text, title text, user_id uuid, details jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    from public.pending_actions wpa
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
    from public.outbound_messages wom
    where coalesce(wom.last_attempt_at, wom.updated_at, wom.created_at) >= p_since
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
$function$;

-- ── §2 — LES FONCTIONS MORTES AVEC LEURS TABLES ─────────────────────────────
-- Elles ne compilent plus, et leurs appelants sont supprimés:
--   * `claim_whatsapp_outbound_retries` — le worker de renvoi Graph n'existe
--     plus (la livraison in-app est une écriture, pas un envoi à retenter);
--   * `consume/release_whatsapp_monthly_quota` — `whatsapp_monthly_quotas` est
--     droppée; il n'y a plus de quota Meta à consommer;
--   * `backfill_whatsapp_template_cost_events` — un backfill ponctuel de 2026
--     sur deux tables dont une est droppée.
drop function if exists public.claim_whatsapp_outbound_retries(integer, text);
drop function if exists public.claim_whatsapp_outbound_retries(int, text);
drop function if exists public.claim_whatsapp_outbound_retries;
drop function if exists public.consume_whatsapp_monthly_quota;
drop function if exists public.release_whatsapp_monthly_quota;
drop function if exists public.backfill_whatsapp_template_cost_events;

-- ── §3 — FAIL LOUD (R7) ─────────────────────────────────────────────────────
do $$
declare
  bad text;
begin
  -- AUCUN corps de fonction ne doit plus nommer une table disparue.
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'auth')
     and (p.prosrc like '%whatsapp_pending_actions%'
       or p.prosrc like '%whatsapp_outbound_messages%'
       or p.prosrc like '%whatsapp_inbound_dedup%'
       or p.prosrc like '%whatsapp_link_requests%'
       or p.prosrc like '%whatsapp_link_tokens%'
       or p.prosrc like '%whatsapp_optin_recovery%'
       or p.prosrc like '%whatsapp_outbound_status_events%'
       or p.prosrc like '%whatsapp_unlinked_inbound_messages%'
       or p.prosrc like '%whatsapp_monthly_quotas%');
  if bad is not null then
    raise exception 'dewhatsapp: corps de fonction pointant une table disparue: %', bad;
  end if;

  -- Et surtout: LE GESTE QUI ÉTAIT CASSÉ REMARCHE. On le prouve pour de vrai,
  -- dans une sous-transaction annulée — un contrôle qui ne fait qu'inspecter du
  -- texte aurait laissé passer la panne d'origine.
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values
      ('5a17dead-0000-4000-8000-00000000c0a1','00000000-0000-0000-0000-000000000000',
       'authenticated','authenticated','dewhatsapp.probe.coach@test.invalid','x',
       now(),now(),now(),'{}','{}'),
      ('5a17dead-0000-4000-8000-00000000c0a2','00000000-0000-0000-0000-000000000000',
       'authenticated','authenticated','dewhatsapp.probe.student@test.invalid','x',
       now(),now(),now(),'{}','{}')
    on conflict (id) do nothing;

    insert into public.coaches (id, user_id, display_name, status)
    values ('5a17dead-0000-4000-8000-00000000cccc',
            '5a17dead-0000-4000-8000-00000000c0a1', 'Probe', 'active')
    on conflict (id) do nothing;

    -- C'EST CET INSERT QUI ÉCHOUAIT.
    insert into public.coach_clients
      (coach_id, student_user_id, invited_email, status, consent_granted_at)
    values ('5a17dead-0000-4000-8000-00000000cccc',
            '5a17dead-0000-4000-8000-00000000c0a2',
            'dewhatsapp.probe.student@test.invalid', 'active', now());

    raise exception 'dewhatsapp_probe_rollback';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'dewhatsapp_probe_rollback' then
        raise exception 'dewhatsapp: lier un eleve a un coach echoue toujours: %', sqlerrm;
      end if;
      raise notice 'dewhatsapp: lier un eleve a un coach fonctionne (sonde annulee)';
    when others then
      raise exception 'dewhatsapp: lier un eleve a un coach echoue toujours: % (%)', sqlerrm, sqlstate;
  end;

  raise notice 'dewhatsapp: corps de fonctions SQL repointes';
end $$;
